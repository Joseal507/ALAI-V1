import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS concept_evidence_links (
  evidence_id TEXT NOT NULL,
  concept_id TEXT NOT NULL,
  confidence_score REAL NOT NULL DEFAULT 0.35,
  created_at TEXT NOT NULL,
  PRIMARY KEY (evidence_id, concept_id),
  FOREIGN KEY (evidence_id) REFERENCES evidence(id),
  FOREIGN KEY (concept_id) REFERENCES concepts(id)
);
`);

const objectives = db.prepare(`
  SELECT
    o.id AS objectiveId,
    o.topic_id AS topicId,
    o.title,
    o.mastery_target AS masteryTarget,
    t.name AS topicName,
    t.description AS topicDescription
  FROM alai_learning_objectives o
  JOIN curriculum_topics t ON t.id = o.topic_id
  WHERE o.status IN ('OPEN', 'IN_PROGRESS')
  ORDER BY o.priority_score DESC, o.created_at ASC
  LIMIT 5
`).all() as {
  objectiveId: string;
  topicId: string;
  title: string;
  masteryTarget: number;
  topicName: string;
  topicDescription: string;
}[];

if (objectives.length === 0) {
  console.log("No open learning objectives found.");
  process.exit(0);
}

const conceptsForTopic = db.prepare(`
  SELECT c.id, c.name, c.description, c.confidence_score, c.uncertainty_score
  FROM topic_concepts tc
  JOIN concepts c ON c.id = tc.concept_id
  WHERE tc.topic_id = ?
`);

const updateConcept = db.prepare(`
  UPDATE concepts
  SET confidence_score = ?,
      uncertainty_score = ?,
      updated_at = ?
  WHERE id = ?
`);

const insertEvidence = db.prepare(`
  INSERT INTO evidence (
    id, source_type, source_name, source_url,
    content_summary, reliability_score, captured_at
  )
  VALUES (?, 'INTERNAL_CURRICULUM_SEED', ?, NULL, ?, 0.55, ?)
`);

const linkEvidence = db.prepare(`
  INSERT OR IGNORE INTO concept_evidence_links (
    evidence_id, concept_id, confidence_score, created_at
  )
  VALUES (?, ?, 0.55, ?)
`);

const updateObjective = db.prepare(`
  UPDATE alai_learning_objectives
  SET status = ?,
      attempts = attempts + 1,
      updated_at = ?
  WHERE id = ?
`);

const completed: string[] = [];
const inProgress: string[] = [];

for (const objective of objectives) {
  updateObjective.run("IN_PROGRESS", now, objective.objectiveId);

  const concepts = conceptsForTopic.all(objective.topicId) as {
    id: string;
    name: string;
    description: string;
    confidence_score: number;
    uncertainty_score: number;
  }[];

  for (const concept of concepts) {
    const evidenceId = crypto.randomUUID();

    insertEvidence.run(
      evidenceId,
      `ALAI internal foundational lesson: ${objective.topicName}`,
      `ALAI studied "${concept.name}" as part of "${objective.topicName}". ${concept.description || objective.topicDescription}`,
      now
    );

    linkEvidence.run(evidenceId, concept.id, now);

    const nextConfidence = Math.min(0.72, concept.confidence_score + 0.18);
    const nextUncertainty = Math.max(0.18, concept.uncertainty_score - 0.18);

    updateConcept.run(
      Number(nextConfidence.toFixed(3)),
      Number(nextUncertainty.toFixed(3)),
      now,
      concept.id
    );
  }

  const after = conceptsForTopic.all(objective.topicId) as {
    confidence_score: number;
  }[];

  const avg =
    after.length === 0
      ? 0
      : after.reduce((sum, c) => sum + c.confidence_score, 0) / after.length;

  if (avg >= objective.masteryTarget) {
    updateObjective.run("COMPLETED", now, objective.objectiveId);
    completed.push(objective.title);
  } else {
    updateObjective.run("IN_PROGRESS", now, objective.objectiveId);
    inProgress.push(`${objective.title} (${avg.toFixed(3)})`);
  }
}

console.log("ALAI autonomous learning engine completed.");
console.log({
  processed: objectives.length,
  completed,
  inProgress,
});

console.table(db.prepare(`
  SELECT
    o.title,
    o.status,
    o.attempts,
    ROUND(AVG(c.confidence_score), 3) AS avgConceptConfidence
  FROM alai_learning_objectives o
  JOIN topic_concepts tc ON tc.topic_id = o.topic_id
  JOIN concepts c ON c.id = tc.concept_id
  GROUP BY o.id
  ORDER BY
    CASE o.status
      WHEN 'OPEN' THEN 1
      WHEN 'IN_PROGRESS' THEN 2
      WHEN 'COMPLETED' THEN 3
      ELSE 4
    END,
    o.priority_score DESC
  LIMIT 20
`).all());

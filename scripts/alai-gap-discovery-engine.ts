import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_discovered_gaps (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  gap_title TEXT NOT NULL,
  gap_description TEXT NOT NULL DEFAULT '',
  severity TEXT NOT NULL DEFAULT 'MEDIUM',
  status TEXT NOT NULL DEFAULT 'OPEN',
  priority_score REAL NOT NULL DEFAULT 0.5,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(source_type, source_id, gap_title)
);
`);

const weakTopics = db.prepare(`
  SELECT
    t.id AS topicId,
    t.name AS topicName,
    d.name AS domainName,
    cc.coverage_score AS coverage
  FROM curriculum_coverage cc
  JOIN curriculum_topics t ON t.id = cc.topic_id
  LEFT JOIN academic_domains d ON d.id = t.domain_id
  WHERE cc.concepts_total > 0
    AND cc.coverage_score < 0.7
  ORDER BY cc.coverage_score ASC
  LIMIT 30
`).all() as {
  topicId: string;
  topicName: string;
  domainName: string | null;
  coverage: number;
}[];

const weakConcepts = db.prepare(`
  SELECT
    c.id AS conceptId,
    c.name AS conceptName,
    c.confidence_score AS confidence,
    c.uncertainty_score AS uncertainty
  FROM concepts c
  WHERE c.confidence_score < 0.7
  ORDER BY c.confidence_score ASC, c.uncertainty_score DESC
  LIMIT 50
`).all() as {
  conceptId: string;
  conceptName: string;
  confidence: number;
  uncertainty: number;
}[];

const openObjectives = db.prepare(`
  SELECT id, title, status, attempts
  FROM alai_learning_objectives
  WHERE status IN ('OPEN', 'IN_PROGRESS')
  ORDER BY priority_score DESC
  LIMIT 30
`).all() as {
  id: string;
  title: string;
  status: string;
  attempts: number;
}[];

const upsertGap = db.prepare(`
  INSERT INTO alai_discovered_gaps (
    id, source_type, source_id, gap_title, gap_description,
    severity, status, priority_score, created_at, updated_at
  )
  VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?)
  ON CONFLICT(source_type, source_id, gap_title) DO UPDATE SET
    gap_description = excluded.gap_description,
    severity = excluded.severity,
    priority_score = MAX(priority_score, excluded.priority_score),
    updated_at = excluded.updated_at
`);

let gaps = 0;

for (const topic of weakTopics) {
  const priority = Math.max(0.3, 1 - topic.coverage);
  upsertGap.run(
    crypto.randomUUID(),
    "CURRICULUM_TOPIC",
    topic.topicId,
    `Improve mastery of ${topic.topicName}`,
    `Topic "${topic.topicName}" in domain "${topic.domainName ?? "unknown"}" has coverage ${topic.coverage}. It needs more learning evidence or concept refinement.`,
    topic.coverage < 0.25 ? "HIGH" : "MEDIUM",
    Number(priority.toFixed(3)),
    now,
    now
  );
  gaps++;
}

for (const concept of weakConcepts) {
  const priority = Math.max(0.3, 1 - concept.confidence + concept.uncertainty * 0.2);
  upsertGap.run(
    crypto.randomUUID(),
    "CONCEPT",
    concept.conceptId,
    `Strengthen concept ${concept.conceptName}`,
    `Concept "${concept.conceptName}" has confidence ${concept.confidence} and uncertainty ${concept.uncertainty}.`,
    concept.confidence < 0.35 ? "HIGH" : "MEDIUM",
    Number(Math.min(1, priority).toFixed(3)),
    now,
    now
  );
  gaps++;
}

for (const objective of openObjectives) {
  const priority = objective.status === "IN_PROGRESS" ? 0.8 : 0.65;
  upsertGap.run(
    crypto.randomUUID(),
    "LEARNING_OBJECTIVE",
    objective.id,
    `Complete ${objective.title}`,
    `Learning objective "${objective.title}" is ${objective.status} after ${objective.attempts} attempts.`,
    objective.attempts >= 4 ? "HIGH" : "MEDIUM",
    priority,
    now,
    now
  );
  gaps++;
}

console.log("ALAI gap discovery engine completed.");
console.log({
  weakTopics: weakTopics.length,
  weakConcepts: weakConcepts.length,
  openObjectives: openObjectives.length,
  gapsProcessed: gaps,
});

console.table(db.prepare(`
  SELECT gap_title AS gap, severity, priority_score AS priority, status
  FROM alai_discovered_gaps
  WHERE status = 'OPEN'
  ORDER BY
    CASE severity
      WHEN 'HIGH' THEN 1
      WHEN 'MEDIUM' THEN 2
      WHEN 'LOW' THEN 3
      ELSE 4
    END,
    priority_score DESC
  LIMIT 25
`).all());

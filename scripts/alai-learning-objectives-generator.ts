import Database from "better-sqlite3";
import crypto from "node:crypto";
import { getActiveLearningDomain } from "../src/learning/education-progression";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_learning_objectives (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL,
  title TEXT NOT NULL,
  objective_type TEXT NOT NULL DEFAULT 'TOPIC_MASTERY',
  status TEXT NOT NULL DEFAULT 'OPEN',
  priority_score REAL NOT NULL DEFAULT 0.5,
  mastery_target REAL NOT NULL DEFAULT 0.7,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(topic_id, title),
  FOREIGN KEY (topic_id) REFERENCES curriculum_topics(id)
);

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

const current = db.prepare(`
  SELECT gs.stage_name AS stageName
  FROM alai_current_state s
  JOIN alai_growth_stage gs ON gs.id = s.current_growth_stage_id
  LIMIT 1
`).get() as { stageName: string } | undefined;

if (!current) throw new Error("ALAI current state not found.");

const activeDomain = getActiveLearningDomain(db);
const domainName = activeDomain.domainName;

const topics = db.prepare(`
  SELECT t.id, t.name, t.description
  FROM curriculum_topics t
  JOIN academic_domains d ON d.id = t.domain_id
  WHERE d.name = ?
    AND t.parent_topic_id IS NOT NULL
  ORDER BY t.depth ASC, t.name ASC
`).all(domainName) as {
  id: string;
  name: string;
  description: string;
}[];

const conceptCount = db.prepare(`
  SELECT COUNT(*) AS count
  FROM topic_concepts
  WHERE topic_id = ?
`);

const upsert = db.prepare(`
  INSERT INTO alai_learning_objectives (
    id, topic_id, title, objective_type, status,
    priority_score, mastery_target, attempts, created_at, updated_at
  )
  VALUES (?, ?, ?, 'TOPIC_MASTERY', 'OPEN', ?, 0.7, 0, ?, ?)
  ON CONFLICT(topic_id, title) DO UPDATE SET
    priority_score = MAX(priority_score, excluded.priority_score),
    updated_at = excluded.updated_at
`);

let createdOrUpdated = 0;

for (const topic of topics) {
  const cc = conceptCount.get(topic.id) as { count: number };
  if (cc.count === 0) continue;

  const title = `Learn ${topic.name}`;
  const priority = topic.name === "Reading" ? 0.99 :
    topic.name === "Writing" ? 0.98 :
    topic.name === "Basic Arithmetic" ? 0.97 :
    topic.name === "Addition" ? 0.96 :
    0.75;

  upsert.run(
    crypto.randomUUID(),
    topic.id,
    title,
    priority,
    now,
    now
  );

  createdOrUpdated++;
}

console.log("ALAI learning objectives generated.");
console.log({
  stage: current.stageName,
  domain: domainName,
  reason: activeDomain.reason,
  knownCoverage: activeDomain.knownCoverage,
  effectiveCoverage: activeDomain.effectiveCoverage,
  passScore: activeDomain.passScore,
  objectivesCreatedOrUpdated: createdOrUpdated,
});

console.table(db.prepare(`
  SELECT
    o.title,
    t.name AS topic,
    o.status,
    o.priority_score AS priority,
    o.mastery_target AS masteryTarget
  FROM alai_learning_objectives o
  JOIN curriculum_topics t ON t.id = o.topic_id
  ORDER BY o.priority_score DESC, o.created_at ASC
  LIMIT 20
`).all());

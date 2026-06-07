import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.pragma("foreign_keys = OFF");

const wipeTables = [
  "alai_autonomous_exams",
  "alai_concept_competencies",
  "alai_concept_self_tests",
  "alai_discovered_gaps",
  "alai_evidence_grounded_exams",
  "alai_evidence_verification",
  "alai_mastery_validations",
  "alai_quality_flags",
  "alai_question_answers",
  "alai_self_questions",
  "autonomous_learning_queue",
  "capabilities",
  "common_errors",
  "concept_aliases",
  "concept_evidence",
  "concept_evidence_links",
  "concept_mastery",
  "concept_prerequisites",
  "concept_stage_flags",
  "concepts",
  "curriculum_completion",
  "curriculum_coverage",
  "domain_coverage_rollup",
  "evidence",
  "knowledge_gaps",
  "learning_events",
  "learning_path",
  "relations",
  "topic_coverage_rollup"
];

for (const table of wipeTables) {
  db.prepare(`DELETE FROM ${table}`).run();
}

db.exec(`
CREATE TABLE IF NOT EXISTS candidate_evidence (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_url TEXT,
  content_summary TEXT NOT NULL,
  reliability_score REAL NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'PENDING',
  rejection_reason TEXT NOT NULL DEFAULT '',
  captured_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(source_url, content_summary)
);

CREATE TABLE IF NOT EXISTS candidate_concepts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  curriculum_topic_id TEXT,
  source_evidence_ids_json TEXT NOT NULL DEFAULT '[]',
  quality_score REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING',
  rejection_reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(name, curriculum_topic_id)
);

CREATE TABLE IF NOT EXISTS candidate_relations (
  id TEXT PRIMARY KEY,
  from_candidate_concept_id TEXT NOT NULL,
  to_candidate_concept_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  source_evidence_ids_json TEXT NOT NULL DEFAULT '[]',
  quality_score REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING',
  rejection_reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alai_genesis_log (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`);

db.prepare(`
  INSERT INTO alai_genesis_log (id, event_type, message, created_at)
  VALUES (?, ?, ?, ?)
`).run(
  crypto.randomUUID(),
  "GENESIS_RESET",
  "Knowledge tables wiped; curriculum/progression/language structure preserved; candidate staging tables created.",
  now
);

const openObjective = db.prepare(`
  INSERT INTO autonomous_learning_queue (
    id,
    target_type,
    target_id,
    objective,
    priority_score,
    status,
    attempts,
    created_at,
    updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const foundationalTopics = db.prepare(`
  SELECT t.id, t.name
  FROM curriculum_topics t
  JOIN academic_domains d ON d.id = t.domain_id
  WHERE d.name = 'Foundational Learning'
  ORDER BY t.depth ASC, t.name ASC
`).all() as { id: string; name: string }[];

let seededQueue = 0;

for (const topic of foundationalTopics) {
  openObjective.run(
    crypto.randomUUID(),
    "CURRICULUM_TOPIC",
    topic.id,
    `Genesis learn and validate foundational topic: ${topic.name}`,
    0.9,
    "OPEN",
    0,
    now,
    now
  );
  seededQueue++;
}

db.pragma("foreign_keys = ON");
db.exec("VACUUM");

console.log("ALAI Genesis Reset completed.");
console.log({
  wipedTables: wipeTables.length,
  preserved: [
    "education_levels",
    "education_ladder",
    "academic_domains",
    "curriculum_topics",
    "topic_prerequisites",
    "topic_concepts",
    "curriculum_taxonomy_rules",
    "curriculum_taxonomy_audit",
    "language_*",
    "alai_growth_stage/current_state/stage_requirements/expansion_gate/learning_objectives"
  ],
  createdStaging: [
    "candidate_evidence",
    "candidate_concepts",
    "candidate_relations",
    "alai_genesis_log"
  ],
  seededFoundationalQueue: seededQueue
});

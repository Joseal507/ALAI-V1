import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const DB_PATH = "data/alai.db";

mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS concepts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'PENDING',
  confidence_score REAL NOT NULL DEFAULT 0,
  uncertainty_score REAL NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS concept_aliases (
  id TEXT PRIMARY KEY,
  concept_id TEXT NOT NULL,
  alias TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (concept_id) REFERENCES concepts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS relations (
  id TEXT PRIMARY KEY,
  from_concept_id TEXT NOT NULL,
  to_concept_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  confidence_score REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (from_concept_id) REFERENCES concepts(id) ON DELETE CASCADE,
  FOREIGN KEY (to_concept_id) REFERENCES concepts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_url TEXT,
  content_summary TEXT NOT NULL DEFAULT '',
  reliability_score REAL NOT NULL DEFAULT 0,
  captured_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS concept_evidence (
  concept_id TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  PRIMARY KEY (concept_id, evidence_id),
  FOREIGN KEY (concept_id) REFERENCES concepts(id) ON DELETE CASCADE,
  FOREIGN KEY (evidence_id) REFERENCES evidence(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS capabilities (
  id TEXT PRIMARY KEY,
  concept_id TEXT NOT NULL,
  capability_type TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  mastery_score REAL NOT NULL DEFAULT 0,
  last_tested_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (concept_id) REFERENCES concepts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS common_errors (
  id TEXT PRIMARY KEY,
  concept_id TEXT NOT NULL,
  error_description TEXT NOT NULL,
  correction TEXT NOT NULL DEFAULT '',
  frequency_score REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (concept_id) REFERENCES concepts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS learning_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  trigger_source TEXT NOT NULL,
  summary TEXT NOT NULL,
  confidence_before REAL,
  confidence_after REAL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS knowledge_gaps (
  id TEXT PRIMARY KEY,
  concept_id TEXT,
  gap_description TEXT NOT NULL,
  priority_score REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (concept_id) REFERENCES concepts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_concepts_name ON concepts(name);
CREATE INDEX IF NOT EXISTS idx_relations_from ON relations(from_concept_id);
CREATE INDEX IF NOT EXISTS idx_relations_to ON relations(to_concept_id);
CREATE INDEX IF NOT EXISTS idx_capabilities_concept ON capabilities(concept_id);
CREATE INDEX IF NOT EXISTS idx_gaps_status ON knowledge_gaps(status);

CREATE TABLE IF NOT EXISTS language_patterns (
  id TEXT PRIMARY KEY,
  pattern_type TEXT NOT NULL,
  instruction TEXT NOT NULL,
  input_example TEXT NOT NULL DEFAULT '',
  output_example TEXT NOT NULL DEFAULT '',
  style_summary TEXT NOT NULL DEFAULT '',
  confidence_score REAL NOT NULL DEFAULT 0.25,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS language_feedback (
  id TEXT PRIMARY KEY,
  user_instruction TEXT NOT NULL,
  previous_response TEXT NOT NULL DEFAULT '',
  improved_response TEXT NOT NULL DEFAULT '',
  feedback_summary TEXT NOT NULL DEFAULT '',
  learned_pattern_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (learned_pattern_id) REFERENCES language_patterns(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_language_patterns_type ON language_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_language_patterns_instruction ON language_patterns(instruction);
`);

console.log("ALAI database initialized at data/alai.db");

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

CREATE TABLE IF NOT EXISTS language_skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  skill_type TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  confidence_score REAL NOT NULL DEFAULT 0.25,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS language_skill_relations (
  id TEXT PRIMARY KEY,
  from_skill_id TEXT NOT NULL,
  to_skill_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  confidence_score REAL NOT NULL DEFAULT 0.25,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (from_skill_id) REFERENCES language_skills(id) ON DELETE CASCADE,
  FOREIGN KEY (to_skill_id) REFERENCES language_skills(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_language_skills_name ON language_skills(name);
CREATE INDEX IF NOT EXISTS idx_language_skill_relations_from ON language_skill_relations(from_skill_id);
CREATE INDEX IF NOT EXISTS idx_language_skill_relations_to ON language_skill_relations(to_skill_id);

CREATE TABLE IF NOT EXISTS language_phrases (
  id TEXT PRIMARY KEY,
  source_language TEXT NOT NULL,
  target_language TEXT NOT NULL,
  source_phrase TEXT NOT NULL,
  target_phrase TEXT NOT NULL,
  phrase_type TEXT NOT NULL DEFAULT 'DOMAIN',
  confidence_score REAL NOT NULL DEFAULT 0.35,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_language_phrases_source ON language_phrases(source_language, target_language, source_phrase);

CREATE TABLE IF NOT EXISTS language_strategies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  confidence_score REAL NOT NULL DEFAULT 0.35,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS language_strategy_relations (
  id TEXT PRIMARY KEY,
  strategy_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  confidence_score REAL NOT NULL DEFAULT 0.35,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (strategy_id) REFERENCES language_strategies(id) ON DELETE CASCADE,
  FOREIGN KEY (skill_id) REFERENCES language_skills(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_language_strategies_name ON language_strategies(name);
CREATE INDEX IF NOT EXISTS idx_language_strategy_relations_strategy ON language_strategy_relations(strategy_id);
CREATE INDEX IF NOT EXISTS idx_language_strategy_relations_skill ON language_strategy_relations(skill_id);


CREATE TABLE IF NOT EXISTS education_levels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  order_index INTEGER NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS academic_domains (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_domain_id TEXT,
  description TEXT NOT NULL DEFAULT '',
  depth INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING',
  confidence_score REAL NOT NULL DEFAULT 0.25,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (parent_domain_id) REFERENCES academic_domains(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS curriculum_topics (
  id TEXT PRIMARY KEY,
  education_level_id TEXT,
  domain_id TEXT,
  parent_topic_id TEXT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  depth INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING',
  confidence_score REAL NOT NULL DEFAULT 0.25,
  expansion_status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (education_level_id) REFERENCES education_levels(id) ON DELETE SET NULL,
  FOREIGN KEY (domain_id) REFERENCES academic_domains(id) ON DELETE SET NULL,
  FOREIGN KEY (parent_topic_id) REFERENCES curriculum_topics(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS topic_prerequisites (
  topic_id TEXT NOT NULL,
  prerequisite_topic_id TEXT NOT NULL,
  confidence_score REAL NOT NULL DEFAULT 0.35,
  created_at TEXT NOT NULL,
  PRIMARY KEY (topic_id, prerequisite_topic_id),
  FOREIGN KEY (topic_id) REFERENCES curriculum_topics(id) ON DELETE CASCADE,
  FOREIGN KEY (prerequisite_topic_id) REFERENCES curriculum_topics(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS topic_concepts (
  topic_id TEXT NOT NULL,
  concept_id TEXT NOT NULL,
  confidence_score REAL NOT NULL DEFAULT 0.35,
  created_at TEXT NOT NULL,
  PRIMARY KEY (topic_id, concept_id),
  FOREIGN KEY (topic_id) REFERENCES curriculum_topics(id) ON DELETE CASCADE,
  FOREIGN KEY (concept_id) REFERENCES concepts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS autonomous_learning_queue (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,
  target_id TEXT,
  objective TEXT NOT NULL,
  priority_score REAL NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'OPEN',
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_academic_domains_parent ON academic_domains(parent_domain_id);
CREATE INDEX IF NOT EXISTS idx_curriculum_topics_parent ON curriculum_topics(parent_topic_id);
CREATE INDEX IF NOT EXISTS idx_curriculum_topics_level ON curriculum_topics(education_level_id);
CREATE INDEX IF NOT EXISTS idx_curriculum_topics_domain ON curriculum_topics(domain_id);
CREATE INDEX IF NOT EXISTS idx_autonomous_learning_queue_status ON autonomous_learning_queue(status);
`);

console.log("ALAI database initialized at data/alai.db");

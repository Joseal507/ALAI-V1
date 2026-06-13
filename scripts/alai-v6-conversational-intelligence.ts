import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_v6_conversation_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  patterns_created INTEGER NOT NULL DEFAULT 0,
  response_skills_created INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'RUNNING'
);

CREATE TABLE IF NOT EXISTS alai_v6_conversation_patterns (
  id TEXT PRIMARY KEY,
  pattern_name TEXT NOT NULL UNIQUE,
  intent_type TEXT NOT NULL,
  response_strategy TEXT NOT NULL,
  quality_goal TEXT NOT NULL,
  priority_score REAL NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alai_v6_response_skills (
  id TEXT PRIMARY KEY,
  skill_name TEXT NOT NULL UNIQUE,
  skill_type TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);

const runId = crypto.randomUUID();
db.prepare(`INSERT INTO alai_v6_conversation_runs (id, started_at, status) VALUES (?, ?, 'RUNNING')`).run(runId, now);

const patterns = [
  ["Direct explanation", "EXPLAIN", "Define, simplify, give example, then connect to related ideas.", "Useful, clear, natural answer."],
  ["Technical explanation", "TECHNICAL", "Use precise terms, structure, mechanisms, and limitations.", "Expert-level clarity."],
  ["Comparison", "COMPARE", "State similarities, differences, examples, and when each applies.", "Clear distinction."],
  ["Relationship reasoning", "RELATE", "Explain how concepts connect through structure, dependency, use, or contrast.", "Meaningful relation."],
  ["Study help", "TEACH", "Explain step-by-step, check understanding, provide practice.", "Student learning."],
  ["Unknown answer", "LOW_CONFIDENCE", "State uncertainty, create research gap, give safe partial answer.", "Honest and useful."],
  ["Project execution", "AGENTIC", "Break request into steps, execute tools, audit result.", "Actionable progress."]
];

let patternsCreated = 0;
for (const p of patterns) {
  const r = db.prepare(`
    INSERT OR IGNORE INTO alai_v6_conversation_patterns
    (id, pattern_name, intent_type, response_strategy, quality_goal, priority_score, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 0.9, 'ACTIVE', ?, ?)
  `).run(crypto.randomUUID(), p[0], p[1], p[2], p[3], now, now);
  patternsCreated += r.changes;
}

const skills = [
  ["natural_clarity", "STYLE", "Answer in natural language instead of database/template language."],
  ["example_generation", "TEACHING", "Create concrete examples for abstract concepts."],
  ["step_by_step_reasoning", "REASONING", "Expose public reasoning steps without internal chain-of-thought."],
  ["uncertainty_handling", "TRUST", "State limits when evidence is weak."],
  ["context_memory_use", "MEMORY", "Use episodic lessons to avoid repeated mistakes."],
  ["answer_self_check", "QUALITY", "Evaluate if the answer actually satisfies the user request."],
  ["followup_gap_detection", "LEARNING", "Create research or mastery tasks from weak answers."]
];

let responseSkillsCreated = 0;
for (const s of skills) {
  const r = db.prepare(`
    INSERT OR IGNORE INTO alai_v6_response_skills
    (id, skill_name, skill_type, description, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)
  `).run(crypto.randomUUID(), s[0], s[1], s[2], now, now);
  responseSkillsCreated += r.changes;
}

db.prepare(`
UPDATE alai_v6_conversation_runs
SET finished_at=?, patterns_created=?, response_skills_created=?, status='COMPLETED'
WHERE id=?
`).run(new Date().toISOString(), patternsCreated, responseSkillsCreated, runId);

console.log("ALAI V6 conversational intelligence completed.");
console.log({ patternsCreated, responseSkillsCreated });

db.close();

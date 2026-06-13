import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_v6_deep_reasoning_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  frameworks_created INTEGER NOT NULL DEFAULT 0,
  reasoning_tests_created INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'RUNNING'
);

CREATE TABLE IF NOT EXISTS alai_v6_reasoning_frameworks (
  id TEXT PRIMARY KEY,
  framework_name TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL,
  reasoning_steps TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alai_v6_reasoning_tests (
  id TEXT PRIMARY KEY,
  test_name TEXT NOT NULL UNIQUE,
  prompt TEXT NOT NULL,
  expected_capability TEXT NOT NULL,
  difficulty_score REAL NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);

const runId = crypto.randomUUID();
db.prepare(`INSERT INTO alai_v6_deep_reasoning_runs (id, started_at, status) VALUES (?, ?, 'RUNNING')`).run(runId, now);

const frameworks = [
  ["Decompose Solve Synthesize", "Break complex questions into subproblems.", "intent -> concepts -> subclaims -> evidence -> synthesis -> answer"],
  ["Causal Reasoning", "Explain causes and effects.", "cause -> mechanism -> effect -> conditions -> uncertainty"],
  ["Comparative Reasoning", "Compare concepts.", "criteria -> similarities -> differences -> examples -> conclusion"],
  ["Curriculum Reasoning", "Learn academic domains.", "domain -> topic -> concept -> evidence -> mastery -> promotion"],
  ["Counterexample Reasoning", "Avoid overclaiming.", "claim -> possible exception -> evidence -> revision"],
  ["Analogical Reasoning", "Use safe analogies.", "source concept -> mapping -> limits -> target explanation"],
  ["Planning Reasoning", "Execute multi-step goals.", "goal -> tasks -> dependencies -> tools -> audit"]
];

let frameworksCreated = 0;
for (const f of frameworks) {
  const r = db.prepare(`
    INSERT OR IGNORE INTO alai_v6_reasoning_frameworks
    (id, framework_name, purpose, reasoning_steps, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)
  `).run(crypto.randomUUID(), f[0], f[1], f[2], now, now);
  frameworksCreated += r.changes;
}

const tests = [
  ["Explain relation with evidence", "Explain how vectors relate to linear algebra using evidence and examples.", "RELATIONAL_REASONING"],
  ["Compare abstract concepts", "Compare vector and scalar with examples and use cases.", "COMPARATIVE_REASONING"],
  ["Causal academic reasoning", "Explain why prerequisites improve mastery in curriculum learning.", "CAUSAL_REASONING"],
  ["Plan learning sequence", "Create a study plan for a weak domain using prerequisites.", "PLANNING_REASONING"],
  ["Detect uncertainty", "Answer a low-evidence question and create a research gap.", "UNCERTAINTY_REASONING"],
  ["Synthesize answer", "Use concepts, beliefs, relations, and memory to answer naturally.", "SYNTHESIS_REASONING"]
];

let testsCreated = 0;
for (const t of tests) {
  const r = db.prepare(`
    INSERT OR IGNORE INTO alai_v6_reasoning_tests
    (id, test_name, prompt, expected_capability, difficulty_score, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 0.82, 'OPEN', ?, ?)
  `).run(crypto.randomUUID(), t[0], t[1], t[2], now, now);
  testsCreated += r.changes;
}

db.prepare(`
UPDATE alai_v6_deep_reasoning_runs
SET finished_at=?, frameworks_created=?, reasoning_tests_created=?, status='COMPLETED'
WHERE id=?
`).run(new Date().toISOString(), frameworksCreated, testsCreated, runId);

console.log("ALAI V6 deep reasoning completed.");
console.log({ frameworksCreated, testsCreated });

db.close();

import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_v2_core_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  phase TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'RUNNING'
);

CREATE TABLE IF NOT EXISTS alai_v2_core_modules (
  id TEXT PRIMARY KEY,
  module_name TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);

const modules = [
  ["Curriculum Full Study", "Study weak domains and curriculum objectives in controlled order."],
  ["Domain Mastery Expansion", "Convert weak domain coverage into concrete mastery objectives."],
  ["Multi-Step Planner", "Break user questions and study tasks into subgoals and dependency chains."],
  ["Real Answer Generator", "Generate direct useful answers from concepts, relations, beliefs, evidence, and memory."],
  ["Core Consolidation", "Keep only governed autonomous loops and avoid uncontrolled learning debt."]
];

for (const [moduleName, purpose] of modules) {
  db.prepare(`
    INSERT INTO alai_v2_core_modules
    (id, module_name, purpose, status, created_at, updated_at)
    VALUES (?, ?, ?, 'ACTIVE', ?, ?)
    ON CONFLICT(module_name) DO UPDATE SET
      purpose=excluded.purpose,
      status='ACTIVE',
      updated_at=excluded.updated_at
  `).run(crypto.randomUUID(), moduleName, purpose, now, now);
}

db.prepare(`
INSERT INTO alai_v2_core_runs
(id, started_at, finished_at, phase, status)
VALUES (?, ?, ?, 'CORE_CONSOLIDATION', 'COMPLETED')
`).run(crypto.randomUUID(), now, new Date().toISOString());

console.log("ALAI V2 core consolidator completed.");
console.table(db.prepare(`SELECT module_name, status FROM alai_v2_core_modules`).all());

db.close();

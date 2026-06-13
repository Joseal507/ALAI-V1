import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_v4_tool_use_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  tools_registered INTEGER NOT NULL DEFAULT 0,
  policies_created INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'RUNNING'
);

CREATE TABLE IF NOT EXISTS alai_v4_tools (
  id TEXT PRIMARY KEY,
  tool_name TEXT NOT NULL UNIQUE,
  tool_type TEXT NOT NULL,
  purpose TEXT NOT NULL,
  risk_level TEXT NOT NULL DEFAULT 'LOW',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alai_v4_tool_policies (
  id TEXT PRIMARY KEY,
  trigger_type TEXT NOT NULL,
  condition TEXT NOT NULL,
  selected_tool TEXT NOT NULL,
  priority_score REAL NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(trigger_type, condition, selected_tool)
);
`);

const runId = crypto.randomUUID();
db.prepare(`INSERT INTO alai_v4_tool_use_runs (id, started_at, status) VALUES (?, ?, 'RUNNING')`).run(runId, now);

const tools = [
  ["semantic_retrieval", "INTERNAL", "Retrieve relevant concepts and context.", "LOW"],
  ["belief_lookup", "INTERNAL", "Retrieve supported beliefs and confidence.", "LOW"],
  ["evidence_lookup", "INTERNAL", "Retrieve evidence links and source grounding.", "LOW"],
  ["relation_court", "INTERNAL", "Validate or delete unsafe relations.", "MEDIUM"],
  ["trace_court", "INTERNAL", "Validate reasoning traces.", "MEDIUM"],
  ["path_quality", "INTERNAL", "Check multi-hop reasoning path coherence.", "MEDIUM"],
  ["research_executor", "RESEARCH", "Research missing knowledge when confidence is low.", "MEDIUM"],
  ["curriculum_executor", "LEARNING", "Execute curriculum learning objectives.", "MEDIUM"],
  ["answer_generator", "OUTPUT", "Generate final answer.", "LOW"],
  ["self_improvement", "META", "Create repair tasks from weak performance.", "MEDIUM"]
];

let toolsRegistered = 0;
for (const t of tools) {
  const r = db.prepare(`
    INSERT OR IGNORE INTO alai_v4_tools
    (id, tool_name, tool_type, purpose, risk_level, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
  `).run(crypto.randomUUID(), t[0], t[1], t[2], t[3], now, now);
  toolsRegistered += r.changes;
}

const policies = [
  ["QUESTION", "question has specific concept terms", "semantic_retrieval", 0.95],
  ["QUESTION", "answer confidence is low", "research_executor", 0.9],
  ["QUESTION", "answer needs final response", "answer_generator", 0.88],
  ["LEARNING", "curriculum objective is open", "curriculum_executor", 0.94],
  ["QUALITY", "relation appears cross-domain or weak", "relation_court", 0.92],
  ["QUALITY", "reasoning trace contains weak path", "trace_court", 0.9],
  ["QUALITY", "multi-hop path has weak semantic continuity", "path_quality", 0.91],
  ["MEMORY", "past failure exists", "self_improvement", 0.86],
  ["BELIEF", "claim needs confidence check", "belief_lookup", 0.85],
  ["EVIDENCE", "claim needs source grounding", "evidence_lookup", 0.85]
];

let policiesCreated = 0;
for (const p of policies) {
  const r = db.prepare(`
    INSERT OR IGNORE INTO alai_v4_tool_policies
    (id, trigger_type, condition, selected_tool, priority_score, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
  `).run(crypto.randomUUID(), p[0], p[1], p[2], p[3], now, now);
  policiesCreated += r.changes;
}

db.prepare(`
UPDATE alai_v4_tool_use_runs
SET finished_at=?, tools_registered=?, policies_created=?, status='COMPLETED'
WHERE id=?
`).run(new Date().toISOString(), toolsRegistered, policiesCreated, runId);

console.log("ALAI V4 tool use brain completed.");
console.log({ toolsRegistered, policiesCreated });

db.close();

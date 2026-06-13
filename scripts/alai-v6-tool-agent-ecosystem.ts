import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_v6_tool_agent_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  routes_created INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'RUNNING'
);

CREATE TABLE IF NOT EXISTS alai_v6_tool_agent_routes (
  id TEXT PRIMARY KEY,
  route_name TEXT NOT NULL UNIQUE,
  agent_goal TEXT NOT NULL,
  tool_sequence TEXT NOT NULL,
  success_metric TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);

const runId = crypto.randomUUID();
db.prepare(`INSERT INTO alai_v6_tool_agent_runs (id, started_at, status) VALUES (?, ?, 'RUNNING')`).run(runId, now);

const routes = [
  ["Question Answer Route", "Answer user question", "semantic_retrieval -> belief_lookup -> evidence_lookup -> answer_generator -> self_check", "answer quality >= 0.8"],
  ["Weak Domain Route", "Improve weak domain", "domain_intelligence -> curriculum_executor -> research_auto_closer -> v5_impact -> ratings", "domainImpact increases"],
  ["Relation Safety Route", "Clean unsafe graph edges", "semantic_grounding -> relation_court -> path_quality -> health", "bad relations = 0"],
  ["Conversation Learning Route", "Learn from weak answer", "v3_answer -> feedback -> research_gap -> research_auto_closer -> regenerate", "answer improves"],
  ["Autonomy Stability Route", "Keep system safe", "debt_governor -> research_auto_closer -> promotion -> health -> readiness", "openFlags=0 and openResearch=0"]
];

let created = 0;
for (const r of routes) {
  const x = db.prepare(`
    INSERT OR IGNORE INTO alai_v6_tool_agent_routes
    (id, route_name, agent_goal, tool_sequence, success_metric, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
  `).run(crypto.randomUUID(), r[0], r[1], r[2], r[3], now, now);
  created += x.changes;
}

db.prepare(`
UPDATE alai_v6_tool_agent_runs
SET finished_at=?, routes_created=?, status='COMPLETED'
WHERE id=?
`).run(new Date().toISOString(), created, runId);

console.log("ALAI V6 tool-agent ecosystem completed.");
console.log({ routesCreated: created });

db.close();

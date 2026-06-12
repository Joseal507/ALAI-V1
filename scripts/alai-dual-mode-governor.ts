import Database from "better-sqlite3";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_dual_mode_governor_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  selected_mode TEXT NOT NULL,
  reason TEXT NOT NULL,
  open_research INTEGER NOT NULL DEFAULT 0,
  open_flags INTEGER NOT NULL DEFAULT 0,
  pending_concepts INTEGER NOT NULL DEFAULT 0,
  health_score REAL NOT NULL DEFAULT 0,
  commands_run INTEGER NOT NULL DEFAULT 0,
  commands_failed INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'RUNNING'
);
`);

function n(sql: string): number {
  return Number((db.prepare(sql).get() as any)?.n ?? 0);
}

function run(command: string): boolean {
  console.log(`\n========== ${command} ==========\n`);
  const result = spawnSync(command, { shell: true, stdio: "inherit", env: process.env });
  return result.status === 0;
}

const openResearch = n(`SELECT COUNT(*) AS n FROM alai_research_questions WHERE status='OPEN'`);
const openFlags = n(`SELECT COUNT(*) AS n FROM alai_quality_flags WHERE status='OPEN'`);
const pending = n(`SELECT COUNT(*) AS n FROM concepts WHERE status='PENDING'`);
const active = n(`SELECT COUNT(*) AS n FROM concepts WHERE status!='REJECTED'`);
const trusted = n(`SELECT COUNT(*) AS n FROM concepts WHERE status IN ('VERIFIED','CANONICAL')`);
const trustedRatio = active === 0 ? 0 : trusted / active;
const healthEstimate = Math.max(0, Math.min(100, Math.round(trustedRatio * 100) - Math.min(30, openFlags) - Math.min(20, Math.floor(openResearch / 50))));

let mode = "LEARNING";
let reason = "Cognitive debt is low enough to allow controlled learning.";

if (openFlags > 0 || openResearch > 20 || pending > trusted || healthEstimate < 80) {
  mode = "CONSOLIDATION";
  reason = `Debt high: openFlags=${openFlags}, openResearch=${openResearch}, pending=${pending}, trusted=${trusted}, healthEstimate=${healthEstimate}.`;
}

const runId = crypto.randomUUID();

db.prepare(`
INSERT INTO alai_dual_mode_governor_runs
(id, started_at, selected_mode, reason, open_research, open_flags, pending_concepts, health_score, status)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'RUNNING')
`).run(runId, now, mode, reason, openResearch, openFlags, pending, healthEstimate);

const commands =
  mode === "CONSOLIDATION"
    ? [
        "npm run alai:cognitive-debt-governor",
        "npm run alai:pending-promotion-v2",
        "npm run alai:belief-revision",
        "npm run alai:episodic-experience",
        "npm run alai:quality-flag-cleaner",
        "npm run alai:dedupe-relations-hard",
        "npm run alai:strict-mastery",
        "npm run alai:promotion-v5",
        "npm run curriculum:completion-sync",
        "npm run curriculum:completion",
        "npm run curriculum:rollup",
        "npm run model:health"
      ]
    : [
        "npm run alai:weak-domain-governor-v2",
        "npm run alai:autonomous-curiosity",
        "npm run alai:research-director",
        "npm run alai:research-governor",
        "npm run alai:research-executor",
        "npm run alai:research-closure",
        "npm run alai:world-model",
        "npm run alai:belief-revision",
        "npm run alai:episodic-experience",
        "npm run model:health"
      ];

let commandsRun = 0;
let commandsFailed = 0;

for (const command of commands) {
  commandsRun++;
  if (!run(command)) commandsFailed++;
}

db.prepare(`
UPDATE alai_dual_mode_governor_runs
SET finished_at=?,
    commands_run=?,
    commands_failed=?,
    status=?
WHERE id=?
`).run(new Date().toISOString(), commandsRun, commandsFailed, commandsFailed === 0 ? "COMPLETED" : "COMPLETED_WITH_WARNINGS", runId);

console.log("ALAI dual-mode governor completed.");
console.log({ mode, reason, commandsRun, commandsFailed });

db.close();

if (commandsFailed > 0) process.exit(1);

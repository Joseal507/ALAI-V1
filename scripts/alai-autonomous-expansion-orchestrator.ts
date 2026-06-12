import Database from "better-sqlite3";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_autonomous_expansion_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  commands_run INTEGER NOT NULL DEFAULT 0,
  commands_failed INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'RUNNING'
);
`);

const commands = [
  "npm run alai:semantic-truth-cycle",
  "npm run alai:research-gap-closer",
  "npm run alai:research-director",
  "npm run alai:research-governor",
  "npm run alai:research-executor",
  "npm run alai:research-closure",
  "npm run alai:curriculum-auto-map",
  "npm run alai:curriculum-autonomy",
  "npm run curriculum:completion-sync",
  "npm run curriculum:completion",
  "npm run curriculum:rollup",
  "npm run alai:reasoning-breakthrough",
  "npm run alai:domain-governor",
  "npm run alai:executive-brain",
  "npm run model:health"
];

const runId = crypto.randomUUID();

db.prepare(`
  INSERT INTO alai_autonomous_expansion_runs (id, started_at, status)
  VALUES (?, ?, 'RUNNING')
`).run(runId, now);

let commandsRun = 0;
let commandsFailed = 0;

for (const command of commands) {
  console.log(`\n========== ALAI AUTONOMOUS EXPANSION RUN: ${command} ==========\n`);

  const result = spawnSync(command, {
    shell: true,
    stdio: "inherit",
    env: process.env,
  });

  commandsRun++;

  if (result.status !== 0) {
    commandsFailed++;
    console.warn(`Command failed but orchestrator continues: ${command}`);
  }
}

db.prepare(`
  UPDATE alai_autonomous_expansion_runs
  SET finished_at=?,
      commands_run=?,
      commands_failed=?,
      status=?
  WHERE id=?
`).run(
  new Date().toISOString(),
  commandsRun,
  commandsFailed,
  commandsFailed === 0 ? "COMPLETED" : "COMPLETED_WITH_WARNINGS",
  runId
);

console.log("ALAI autonomous expansion orchestrator completed.");
console.log({ commandsRun, commandsFailed });

db.close();

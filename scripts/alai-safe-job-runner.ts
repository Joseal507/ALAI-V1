import Database from "better-sqlite3";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";

const db = new Database("data/alai.db");

db.exec(`
CREATE TABLE IF NOT EXISTS alai_job_locks (
  job_name TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alai_safe_job_runs (
  id TEXT PRIMARY KEY,
  job_name TEXT NOT NULL,
  status TEXT NOT NULL,
  exit_code INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL
);
`);

const job = process.argv[2];
const timeoutMs = Number(process.argv[3] || 240000);

if (!job) {
  console.error("Usage: npm run alai:safe-job -- scriptName timeoutMs");
  process.exit(1);
}

const now = new Date();
const nowIso = now.toISOString();

const existing = db.prepare(`
SELECT status, started_at
FROM alai_job_locks
WHERE job_name=?
`).get(job) as any;

if (existing?.status === "RUNNING") {
  const ageMs = Date.now() - new Date(existing.started_at).getTime();

  if (ageMs < timeoutMs + 60000) {
    console.log(`SKIP ${job}: already running`);
    db.close();
    process.exit(0);
  }

  console.log(`STALE LOCK CLEARED: ${job}`);
}

db.prepare(`
INSERT INTO alai_job_locks (job_name, status, started_at, updated_at)
VALUES (?, 'RUNNING', ?, ?)
ON CONFLICT(job_name) DO UPDATE SET
  status='RUNNING',
  started_at=excluded.started_at,
  updated_at=excluded.updated_at
`).run(job, nowIso, nowIso);

console.log(`\n========== SAFE JOB START: ${job} ==========\n`);

const result = spawnSync("npm", ["run", job], {
  stdio: "inherit",
  timeout: timeoutMs
});

const finished = new Date().toISOString();
const exitCode = result.status ?? 124;
const status = exitCode === 0 ? "OK" : "FAILED_OR_TIMEOUT";

db.prepare(`
UPDATE alai_job_locks
SET status=?, updated_at=?
WHERE job_name=?
`).run(status, finished, job);

db.prepare(`
INSERT INTO alai_safe_job_runs
(id, job_name, status, exit_code, started_at, finished_at)
VALUES (?, ?, ?, ?, ?, ?)
`).run(crypto.randomUUID(), job, status, exitCode, nowIso, finished);

console.log(`\n========== SAFE JOB END: ${job} => ${status} ==========\n`);

db.close();
process.exit(0);

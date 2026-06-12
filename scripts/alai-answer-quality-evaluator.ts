import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_answer_quality_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  traces_scanned INTEGER NOT NULL DEFAULT 0,
  passed INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'RUNNING'
);

CREATE TABLE IF NOT EXISTS alai_answer_quality_scores (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  clarity_score REAL NOT NULL DEFAULT 0,
  grounding_score REAL NOT NULL DEFAULT 0,
  reasoning_score REAL NOT NULL DEFAULT 0,
  uncertainty_score REAL NOT NULL DEFAULT 0,
  total_score REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);

const runId = crypto.randomUUID();

db.prepare(`
INSERT INTO alai_answer_quality_runs (id, started_at, status)
VALUES (?, ?, 'RUNNING')
`).run(runId, now);

const traces = db.prepare(`
SELECT id, public_reasoning AS reasoning, conclusion, confidence_score AS confidence
FROM alai_reasoning_traces
WHERE status='READY'
ORDER BY created_at DESC
LIMIT 500
`).all() as any[];

let passed = 0;
let failed = 0;

for (const t of traces) {
  const reasoning = String(t.reasoning || "");
  const conclusion = String(t.conclusion || "");
  const confidence = Number(t.confidence || 0.5);

  const clarity = conclusion.length > 40 ? 0.8 : 0.4;
  const grounding = reasoning.includes("--") ? 0.85 : 0.4;
  const reasoningScore = reasoning.includes("Step") ? 0.85 : 0.4;
  const uncertainty = confidence < 0.95 ? 0.8 : 0.65;
  const total = Number(((clarity + grounding + reasoningScore + uncertainty) / 4).toFixed(3));
  const status = total >= 0.72 ? "PASSED" : "FAILED";

  if (status === "PASSED") passed++;
  else failed++;

  db.prepare(`
    INSERT INTO alai_answer_quality_scores
    (id, trace_id, clarity_score, grounding_score, reasoning_score, uncertainty_score, total_score, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    t.id,
    clarity,
    grounding,
    reasoningScore,
    uncertainty,
    total,
    status,
    now,
    now
  );
}

db.prepare(`
UPDATE alai_answer_quality_runs
SET finished_at=?,
    traces_scanned=?,
    passed=?,
    failed=?,
    status='COMPLETED'
WHERE id=?
`).run(new Date().toISOString(), traces.length, passed, failed, runId);

console.log("ALAI answer quality evaluator completed.");
console.log({ tracesScanned: traces.length, passed, failed });

db.close();

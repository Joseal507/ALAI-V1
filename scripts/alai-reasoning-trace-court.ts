import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_reasoning_trace_court_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  traces_scanned INTEGER NOT NULL DEFAULT 0,
  traces_kept INTEGER NOT NULL DEFAULT 0,
  traces_rejected INTEGER NOT NULL DEFAULT 0,
  traces_rewritten INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'RUNNING'
);

CREATE TABLE IF NOT EXISTS alai_reasoning_trace_verdicts (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  relevance_score REAL NOT NULL,
  verdict TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`);

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const toxicTerms = [
  "water utility",
  "preening",
  "schooling behavior",
  "solitary hunter",
  "aquatic locomotion",
  "adaptive radiation",
  "cat --",
  "cat "
];

const runId = crypto.randomUUID();

db.prepare(`
INSERT INTO alai_reasoning_trace_court_runs (id, started_at, status)
VALUES (?, ?, 'RUNNING')
`).run(runId, now);

const traces = db.prepare(`
SELECT id, public_reasoning, conclusion, confidence_score
FROM alai_reasoning_traces
ORDER BY created_at DESC
LIMIT 5000
`).all() as any[];

let kept = 0;
let rejected = 0;
let rewritten = 0;

for (const t of traces) {
  const text = normalize(`${t.public_reasoning} ${t.conclusion}`);

  let relevance = Number(t.confidence_score || 0.5);
  let verdict = "KEEP";
  let reason = "Trace passed basic contamination check.";

  const toxic = toxicTerms.find(x => text.includes(normalize(x)));

  if (toxic) {
    relevance = 0;
    verdict = "REJECT";
    reason = `Trace contains contaminated term: ${toxic}`;
    db.prepare(`DELETE FROM alai_reasoning_traces WHERE id=?`).run(t.id);
    rejected++;
  } else {
    kept++;
  }

  db.prepare(`
  INSERT INTO alai_reasoning_trace_verdicts
  (id, trace_id, relevance_score, verdict, reason, created_at)
  VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    t.id,
    relevance,
    verdict,
    reason,
    now
  );
}

db.prepare(`
UPDATE alai_reasoning_trace_court_runs
SET finished_at=?,
    traces_scanned=?,
    traces_kept=?,
    traces_rejected=?,
    traces_rewritten=?,
    status='COMPLETED'
WHERE id=?
`).run(new Date().toISOString(), traces.length, kept, rejected, rewritten, runId);

console.log("ALAI reasoning trace court completed.");
console.log({ scanned: traces.length, kept, rejected, rewritten });

db.close();

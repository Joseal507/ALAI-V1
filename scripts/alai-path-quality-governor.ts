import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_path_quality_governor_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  traces_scanned INTEGER NOT NULL DEFAULT 0,
  paths_kept INTEGER NOT NULL DEFAULT 0,
  paths_deleted INTEGER NOT NULL DEFAULT 0,
  paths_rewritten INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'RUNNING'
);

CREATE TABLE IF NOT EXISTS alai_path_quality_verdicts (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  path_text TEXT NOT NULL,
  coherence_score REAL NOT NULL,
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
    .replace(/[^a-z0-9\s\-\>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const stop = new Set([
  "the","and","for","with","from","into","onto","that","this","what","when","where",
  "que","para","como","con","del","las","los","una","uno","por",
  "education","learning","concept","system","systems","basic","general","principle","principles",
  "object","objects","thing","things","topic","topics","knowledge","artificial","intelligence"
]);

function terms(text: string): string[] {
  return normalize(text)
    .replace(/\-\-/g, " ")
    .replace(/\>/g, " ")
    .split(" ")
    .filter(t => t.length >= 3 && !stop.has(t));
}

function lexicalOverlap(a: string, b: string): number {
  const A = new Set(terms(a));
  const B = new Set(terms(b));
  if (A.size === 0 || B.size === 0) return 0;

  let shared = 0;
  for (const t of A) if (B.has(t)) shared++;

  return shared / Math.max(1, Math.min(A.size, B.size));
}

const bannedBridgeTerms = [
  "foraging",
  "solitary hunter",
  "preening",
  "cat",
  "water utility",
  "aquatic locomotion",
  "adaptive radiation",
  "schooling behavior"
];

function contaminated(text: string): string | null {
  const n = normalize(text);
  for (const t of bannedBridgeTerms) {
    if (n.includes(normalize(t))) return t;
  }
  return null;
}

function extractNodes(path: string): string[] {
  return path
    .split(/--[^>]+-->/g)
    .map(x => x.trim())
    .filter(Boolean);
}

const runId = crypto.randomUUID();

db.prepare(`
INSERT INTO alai_path_quality_governor_runs (id, started_at, status)
VALUES (?, ?, 'RUNNING')
`).run(runId, now);

const traces = db.prepare(`
SELECT id, public_reasoning, conclusion, confidence_score
FROM alai_reasoning_traces
ORDER BY created_at DESC
LIMIT 5000
`).all() as any[];

let kept = 0;
let deleted = 0;
let rewritten = 0;

for (const trace of traces) {
  const text = `${trace.public_reasoning} ${trace.conclusion}`;
  const bad = contaminated(text);

  let coherence = 0.5;
  let verdict = "KEEP";
  let reason = "Path passed coherence check.";

  const nodes = extractNodes(String(trace.public_reasoning || ""));

  if (bad) {
    coherence = 0;
    verdict = "DELETE";
    reason = `Path contains banned bridge term: ${bad}`;
  } else if (nodes.length >= 2) {
    const overlaps: number[] = [];

    for (let i = 0; i < nodes.length - 1; i++) {
      overlaps.push(lexicalOverlap(nodes[i], nodes[i + 1]));
    }

    const avgOverlap =
      overlaps.reduce((a,b)=>a+b,0) / Math.max(1, overlaps.length);

    coherence = Number(avgOverlap.toFixed(3));

    if (coherence < 0.04 && nodes.length > 2) {
      verdict = "DELETE";
      reason = `Multi-hop path has weak semantic continuity: coherence=${coherence}`;
    } else if (coherence < 0.08) {
      verdict = "REWRITE";
      reason = `Path too weak for direct use; composer should fallback to local reasoning: coherence=${coherence}`;
    }
  } else {
    verdict = "REWRITE";
    coherence = 0.1;
    reason = "Trace path could not be parsed into reliable nodes.";
  }

  if (verdict === "DELETE") {
    db.prepare(`DELETE FROM alai_reasoning_traces WHERE id=?`).run(trace.id);
    deleted++;
  } else if (verdict === "REWRITE") {
    db.prepare(`
      UPDATE alai_reasoning_traces
      SET status='WEAK',
          updated_at=?
      WHERE id=?
    `).run(now, trace.id);
    rewritten++;
  } else {
    kept++;
  }

  db.prepare(`
  INSERT INTO alai_path_quality_verdicts
  (id, trace_id, path_text, coherence_score, verdict, reason, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    trace.id,
    String(trace.public_reasoning || ""),
    coherence,
    verdict,
    reason,
    now
  );
}

db.prepare(`
UPDATE alai_path_quality_governor_runs
SET finished_at=?,
    traces_scanned=?,
    paths_kept=?,
    paths_deleted=?,
    paths_rewritten=?,
    status='COMPLETED'
WHERE id=?
`).run(new Date().toISOString(), traces.length, kept, deleted, rewritten, runId);

console.log("ALAI path quality governor completed.");
console.log({ scanned: traces.length, kept, deleted, rewritten });

console.table(db.prepare(`
SELECT verdict, COUNT(*) AS count
FROM alai_path_quality_verdicts
GROUP BY verdict
ORDER BY count DESC
`).all());

db.close();

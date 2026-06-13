import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_semantic_relation_grounding_v2_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  scanned INTEGER NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0,
  kept INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'RUNNING'
);

CREATE TABLE IF NOT EXISTS alai_semantic_relation_grounding_v2_verdicts (
  id TEXT PRIMARY KEY,
  relation_id TEXT NOT NULL,
  from_name TEXT NOT NULL,
  to_name TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  verdict TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`);

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

const advancedTargets = [
  "machine learning",
  "linear algebra",
  "artificial general intelligence",
  "vector",
  "scalar",
  "primary education"
];

const suspiciousSources = [
  "ear",
  "cat",
  "water utility",
  "preening",
  "foraging",
  "schooling behavior",
  "aquatic locomotion",
  "adaptive radiation",
  "anthroposophy",
  "transitoria cuarta",
  "three rs"
];

const runId = crypto.randomUUID();

db.prepare(`
INSERT INTO alai_semantic_relation_grounding_v2_runs (id, started_at, status)
VALUES (?, ?, 'RUNNING')
`).run(runId, now);

const rows = db.prepare(`
SELECT
  r.id,
  r.relation_type AS relationType,
  c1.name AS fromName,
  c2.name AS toName
FROM relations r
JOIN concepts c1 ON c1.id=r.from_concept_id
JOIN concepts c2 ON c2.id=r.to_concept_id
`).all() as any[];

let deleted = 0;
let kept = 0;

for (const r of rows) {
  const a = norm(r.fromName);
  const b = norm(r.toName);
  const pair = `${a} ${b}`;

  const advanced = advancedTargets.some(t => pair.includes(t));
  const suspicious = suspiciousSources.some(t => pair.includes(t));

  let verdict = "KEEP";
  let reason = "No high-risk semantic mismatch detected.";

  if (advanced && suspicious) {
    verdict = "DELETE";
    reason = "High-risk cross-domain relation between advanced academic concept and suspicious unrelated concept.";
    db.prepare(`DELETE FROM relations WHERE id=?`).run(r.id);
    deleted++;
  } else {
    kept++;
  }

  db.prepare(`
  INSERT INTO alai_semantic_relation_grounding_v2_verdicts
  (id, relation_id, from_name, to_name, relation_type, verdict, reason, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    r.id,
    r.fromName,
    r.toName,
    r.relationType,
    verdict,
    reason,
    now
  );
}

db.prepare(`
UPDATE alai_semantic_relation_grounding_v2_runs
SET finished_at=?,
    scanned=?,
    deleted=?,
    kept=?,
    status='COMPLETED'
WHERE id=?
`).run(new Date().toISOString(), rows.length, deleted, kept, runId);

console.log("ALAI semantic relation grounding v2 completed.");
console.log({ scanned: rows.length, deleted, kept });

db.close();

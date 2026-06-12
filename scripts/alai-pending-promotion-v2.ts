import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_pending_promotion_v2_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  scanned INTEGER NOT NULL DEFAULT 0,
  verified INTEGER NOT NULL DEFAULT 0,
  rejected INTEGER NOT NULL DEFAULT 0,
  preserved INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'RUNNING'
);
`);

const runId = crypto.randomUUID();

db.prepare(`
INSERT INTO alai_pending_promotion_v2_runs (id, started_at, status)
VALUES (?, ?, 'RUNNING')
`).run(runId, now);

const rows = db.prepare(`
SELECT
  c.id,
  c.name,
  c.confidence_score AS confidence,
  COALESCE(cm.mastery_score, 0) AS mastery,
  COUNT(DISTINCT cel.evidence_id) AS evidence,
  COUNT(DISTINCT r.id) AS relations,
  COUNT(DISTINCT qf.id) AS openFlags
FROM concepts c
LEFT JOIN concept_mastery cm ON cm.concept_id=c.id
LEFT JOIN concept_evidence_links cel ON cel.concept_id=c.id
LEFT JOIN relations r ON r.from_concept_id=c.id OR r.to_concept_id=c.id
LEFT JOIN alai_quality_flags qf ON qf.target_id=c.id AND qf.status='OPEN'
WHERE c.status='PENDING'
GROUP BY c.id
ORDER BY mastery DESC, evidence DESC, relations DESC
LIMIT 2000
`).all() as any[];

let verified = 0;
let rejected = 0;
let preserved = 0;

const updateVerified = db.prepare(`
UPDATE concepts
SET status='VERIFIED',
    confidence_score=MAX(confidence_score, 0.72),
    updated_at=?
WHERE id=?
`);

const updateRejected = db.prepare(`
UPDATE concepts
SET status='REJECTED',
    confidence_score=MIN(confidence_score, 0.2),
    updated_at=?
WHERE id=?
`);

for (const row of rows) {
  const mastery = Number(row.mastery || 0);
  const evidence = Number(row.evidence || 0);
  const relations = Number(row.relations || 0);
  const flags = Number(row.openFlags || 0);

  if (flags === 0 && evidence >= 2 && relations >= 3 && mastery >= 0.55) {
    updateVerified.run(now, row.id);
    verified++;
    continue;
  }

  if (flags > 0 || (evidence === 0 && relations < 2 && mastery < 0.3)) {
    updateRejected.run(now, row.id);
    rejected++;
    continue;
  }

  preserved++;
}

db.prepare(`
UPDATE alai_pending_promotion_v2_runs
SET finished_at=?,
    scanned=?,
    verified=?,
    rejected=?,
    preserved=?,
    status='COMPLETED'
WHERE id=?
`).run(new Date().toISOString(), rows.length, verified, rejected, preserved, runId);

console.log("ALAI pending promotion v2 completed.");
console.log({ scanned: rows.length, verified, rejected, preserved });

console.table(db.prepare(`
SELECT status, COUNT(*) AS count
FROM concepts
GROUP BY status
`).all());

db.close();

import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_belief_revision_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  beliefs_scanned INTEGER NOT NULL DEFAULT 0,
  beliefs_revised INTEGER NOT NULL DEFAULT 0,
  beliefs_contested INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'RUNNING'
);

CREATE TABLE IF NOT EXISTS alai_belief_counterevidence (
  id TEXT PRIMARY KEY,
  belief_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT,
  reason TEXT NOT NULL,
  severity REAL NOT NULL DEFAULT 0.5,
  created_at TEXT NOT NULL
);
`);

const runId = crypto.randomUUID();

db.prepare(`
INSERT INTO alai_belief_revision_runs (id, started_at, status)
VALUES (?, ?, 'RUNNING')
`).run(runId, now);

const beliefs = db.prepare(`
SELECT id, subject_id AS subjectId, subject_name AS subjectName, confidence_score AS confidence
FROM alai_beliefs
ORDER BY updated_at DESC
LIMIT 1000
`).all() as any[];

let revised = 0;
let contested = 0;

for (const b of beliefs) {
  const openFlags = Number((db.prepare(`
    SELECT COUNT(*) AS n
    FROM alai_quality_flags
    WHERE target_id=?
      AND status='OPEN'
  `).get(b.subjectId) as any)?.n ?? 0);

  const evidence = Number((db.prepare(`
    SELECT COUNT(*) AS n
    FROM concept_evidence_links
    WHERE concept_id=?
  `).get(b.subjectId) as any)?.n ?? 0);

  const oldConfidence = Number(b.confidence || 0.5);
  const newConfidence = Math.max(0.05, Math.min(0.98, oldConfidence + evidence * 0.01 - openFlags * 0.18));
  const newStatus = openFlags > 0 ? "CONTESTED" : newConfidence >= 0.7 ? "SUPPORTED" : "PROVISIONAL";

  if (openFlags > 0) {
    db.prepare(`
      INSERT INTO alai_belief_counterevidence
      (id, belief_id, source_type, source_id, reason, severity, created_at)
      VALUES (?, ?, 'QUALITY_FLAG', ?, ?, 0.8, ?)
    `).run(
      crypto.randomUUID(),
      b.id,
      b.subjectId,
      `Open quality flags challenge belief about ${b.subjectName}.`,
      now
    );
    contested++;
  }

  if (Math.abs(oldConfidence - newConfidence) >= 0.03 || openFlags > 0) {
    db.prepare(`
      UPDATE alai_beliefs
      SET confidence_score=?,
          counterevidence_count=counterevidence_count + ?,
          status=?,
          updated_at=?
      WHERE id=?
    `).run(newConfidence, openFlags, newStatus, now, b.id);

    db.prepare(`
      INSERT INTO alai_belief_revisions
      (id, belief_id, previous_confidence, new_confidence, reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      b.id,
      oldConfidence,
      newConfidence,
      `Belief revised using evidence_count=${evidence} and open_flags=${openFlags}.`,
      now
    );

    revised++;
  }
}

db.prepare(`
UPDATE alai_belief_revision_runs
SET finished_at=?,
    beliefs_scanned=?,
    beliefs_revised=?,
    beliefs_contested=?,
    status='COMPLETED'
WHERE id=?
`).run(new Date().toISOString(), beliefs.length, revised, contested, runId);

console.log("ALAI belief revision completed.");
console.log({ scanned: beliefs.length, revised, contested });

console.table(db.prepare(`
SELECT status, COUNT(*) AS count
FROM alai_beliefs
GROUP BY status
`).all());

db.close();

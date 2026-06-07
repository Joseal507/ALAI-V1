import Database from "better-sqlite3";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_evidence_verification (
  id TEXT PRIMARY KEY,
  evidence_id TEXT NOT NULL UNIQUE,
  verification_status TEXT NOT NULL DEFAULT 'PENDING',
  verification_score REAL NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (evidence_id) REFERENCES evidence(id)
);
`);

const evidenceRows = db.prepare(`
  SELECT id, source_type, source_name, content_summary, reliability_score
  FROM evidence
  WHERE id NOT IN (
    SELECT evidence_id FROM alai_evidence_verification
  )
  ORDER BY captured_at ASC
  LIMIT 200
`).all() as {
  id: string;
  source_type: string;
  source_name: string;
  content_summary: string;
  reliability_score: number;
}[];

const insertVerification = db.prepare(`
  INSERT INTO alai_evidence_verification (
    id, evidence_id, verification_status, verification_score,
    reason, created_at, updated_at
  )
  VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?)
`);

const updateEvidence = db.prepare(`
  UPDATE evidence
  SET reliability_score = ?
  WHERE id = ?
`);

let verified = 0;
let weak = 0;

for (const row of evidenceRows) {
  const hasSummary = row.content_summary.trim().length >= 20;
  const isInternal = row.source_type.includes("INTERNAL");
  const score = Math.max(
    row.reliability_score,
    (hasSummary ? 0.25 : 0) + (isInternal ? 0.35 : 0.2)
  );

  const status = score >= 0.55 ? "VERIFIED_INTERNAL" : "WEAK";
  const reason = status === "VERIFIED_INTERNAL"
    ? "Evidence has adequate summary and controlled internal source."
    : "Evidence needs stronger source or richer summary.";

  insertVerification.run(
    row.id,
    status,
    Number(score.toFixed(3)),
    reason,
    now,
    now
  );

  updateEvidence.run(Number(score.toFixed(3)), row.id);

  if (status === "VERIFIED_INTERNAL") verified++;
  else weak++;
}

console.log("ALAI evidence verifier completed.");
console.log({ checked: evidenceRows.length, verified, weak });

console.table(db.prepare(`
  SELECT
    v.verification_status AS status,
    COUNT(*) AS count,
    ROUND(AVG(v.verification_score), 3) AS avgScore
  FROM alai_evidence_verification v
  GROUP BY v.verification_status
`).all());

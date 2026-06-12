import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_beliefs (
  id TEXT PRIMARY KEY,
  claim TEXT NOT NULL UNIQUE,
  subject_type TEXT NOT NULL,
  subject_id TEXT,
  subject_name TEXT NOT NULL,
  confidence_score REAL NOT NULL DEFAULT 0.5,
  evidence_count INTEGER NOT NULL DEFAULT 0,
  counterevidence_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PROVISIONAL',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alai_belief_revisions (
  id TEXT PRIMARY KEY,
  belief_id TEXT NOT NULL,
  previous_confidence REAL NOT NULL,
  new_confidence REAL NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`);

const concepts = db.prepare(`
SELECT
  c.id,
  c.name,
  c.status,
  COALESCE(c.confidence_score,0.5) AS confidence,
  COUNT(DISTINCT cel.evidence_id) AS evidenceCount,
  COUNT(DISTINCT qf.id) AS counterCount
FROM concepts c
LEFT JOIN concept_evidence_links cel ON cel.concept_id=c.id
LEFT JOIN alai_quality_flags qf ON qf.target_id=c.id AND qf.status='OPEN'
WHERE c.status IN ('PENDING','VERIFIED','CANONICAL')
GROUP BY c.id
ORDER BY evidenceCount DESC, counterCount ASC
LIMIT 500
`).all() as any[];

let beliefsCreated = 0;
let beliefsUpdated = 0;
let revisions = 0;

for (const c of concepts) {
  const evidence = Number(c.evidenceCount || 0);
  const counter = Number(c.counterCount || 0);
  const base = Number(c.confidence || 0.5);
  const confidence = Math.max(0.1, Math.min(0.98, base + evidence * 0.04 - counter * 0.12));
  const status = counter > 0 ? "CONTESTED" : evidence >= 2 && confidence >= 0.7 ? "SUPPORTED" : "PROVISIONAL";
  const claim = `${c.name} is a knowledge concept ALAI currently represents with status ${c.status}.`;

  const existing = db.prepare(`SELECT id, confidence_score FROM alai_beliefs WHERE claim=?`).get(claim) as any;

  if (!existing) {
    db.prepare(`
      INSERT INTO alai_beliefs
      (id, claim, subject_type, subject_id, subject_name, confidence_score, evidence_count, counterevidence_count, status, created_at, updated_at)
      VALUES (?, ?, 'CONCEPT', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      claim,
      c.id,
      c.name,
      confidence,
      evidence,
      counter,
      status,
      now,
      now
    );
    beliefsCreated++;
  } else {
    db.prepare(`
      UPDATE alai_beliefs
      SET confidence_score=?, evidence_count=?, counterevidence_count=?, status=?, updated_at=?
      WHERE id=?
    `).run(confidence, evidence, counter, status, now, existing.id);
    beliefsUpdated++;

    if (Math.abs(Number(existing.confidence_score) - confidence) >= 0.1) {
      db.prepare(`
        INSERT INTO alai_belief_revisions
        (id, belief_id, previous_confidence, new_confidence, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        crypto.randomUUID(),
        existing.id,
        Number(existing.confidence_score),
        confidence,
        "Belief confidence revised after evidence/counterevidence update.",
        now
      );
      revisions++;
    }
  }
}

console.log("ALAI belief system engine completed.");
console.log({ beliefsCreated, beliefsUpdated, revisions });

console.table(db.prepare(`
SELECT status, COUNT(*) AS count
FROM alai_beliefs
GROUP BY status
`).all());

db.close();

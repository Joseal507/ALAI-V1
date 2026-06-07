import Database from "better-sqlite3";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

const rows = db.prepare(`
  SELECT
    c.id,
    c.name,
    c.status,
    c.confidence_score AS confidence,
    cm.mastery_score AS mastery
  FROM concepts c
  JOIN concept_mastery cm ON cm.concept_id = c.id
  WHERE c.status = 'VERIFIED'
    AND cm.mastery_score >= 0.82
`).all() as {
  id: string;
  name: string;
  status: string;
  confidence: number;
  mastery: number;
}[];

let promoted = 0;

for (const row of rows) {
  db.prepare(`
    UPDATE concepts
    SET status = 'CANONICAL',
        confidence_score = MAX(confidence_score, 0.88),
        uncertainty_score = MIN(uncertainty_score, 0.12),
        updated_at = ?
    WHERE id = ?
      AND status = 'VERIFIED'
  `).run(now, row.id);

  promoted++;
  console.log("Canonical:", row.name, { mastery: row.mastery });
}

console.log("Mastered concept promotion completed.");
console.log({ promoted });

import Database from "better-sqlite3";

const db = new Database("data/alai.db");

const rows = db.prepare(`
  SELECT
    concepts.id,
    concepts.name,
    concepts.status,
    concepts.confidence_score AS confidenceScore,
    COUNT(DISTINCT relations.id) AS relationCount,
    SUM(
      CASE
        WHEN related.status IN ('VERIFIED', 'CANONICAL') THEN 1
        ELSE 0
      END
    ) AS verifiedNeighborCount
  FROM concepts
  LEFT JOIN relations
    ON relations.from_concept_id = concepts.id
    OR relations.to_concept_id = concepts.id
  LEFT JOIN concepts AS related
    ON related.id =
      CASE
        WHEN relations.from_concept_id = concepts.id THEN relations.to_concept_id
        ELSE relations.from_concept_id
      END
  WHERE concepts.status = 'PENDING'
  GROUP BY concepts.id
`).all() as {
  id: string;
  name: string;
  status: string;
  confidenceScore: number;
  relationCount: number;
  verifiedNeighborCount: number | null;
}[];

let strengthened = 0;
let skipped = 0;

for (const row of rows) {
  const verifiedNeighborCount = row.verifiedNeighborCount ?? 0;

  const shouldStrengthen =
    row.relationCount >= 3 ||
    verifiedNeighborCount >= 1;

  if (!shouldStrengthen) {
    skipped++;
    continue;
  }

  const relationBoost = Math.min(row.relationCount * 0.03, 0.18);
  const verifiedNeighborBoost = Math.min(verifiedNeighborCount * 0.08, 0.16);
  const nextConfidence = Math.min(
    0.65,
    Math.max(row.confidenceScore, row.confidenceScore + relationBoost + verifiedNeighborBoost)
  );

  if (nextConfidence <= row.confidenceScore) {
    skipped++;
    continue;
  }

  db.prepare(`
    UPDATE concepts
    SET confidence_score = ?,
        uncertainty_score = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    nextConfidence,
    Math.max(0, 1 - nextConfidence),
    new Date().toISOString(),
    row.id
  );

  strengthened++;
  console.log("Strengthened:", {
    name: row.name,
    relationCount: row.relationCount,
    verifiedNeighborCount,
    from: row.confidenceScore,
    to: nextConfidence,
  });
}

console.log("Related concept strengthening completed.");
console.log({ strengthened, skipped });

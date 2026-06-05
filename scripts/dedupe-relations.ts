import Database from "better-sqlite3";

const db = new Database("data/alai.db");

const duplicates = db.prepare(`
  SELECT
    from_concept_id,
    to_concept_id,
    relation_type,
    COUNT(*) AS count
  FROM relations
  GROUP BY from_concept_id, to_concept_id, relation_type
  HAVING COUNT(*) > 1
`).all() as {
  from_concept_id: string;
  to_concept_id: string;
  relation_type: string;
  count: number;
}[];

let deleted = 0;

for (const duplicate of duplicates) {
  const rows = db.prepare(`
    SELECT id
    FROM relations
    WHERE from_concept_id = ?
      AND to_concept_id = ?
      AND relation_type = ?
    ORDER BY confidence_score DESC, created_at ASC
  `).all(
    duplicate.from_concept_id,
    duplicate.to_concept_id,
    duplicate.relation_type
  ) as { id: string }[];

  const keep = rows[0];

  for (const row of rows.slice(1)) {
    db.prepare(`
      DELETE FROM relations
      WHERE id = ?
    `).run(row.id);

    deleted++;
  }

  console.log("Kept relation:", keep.id, "deleted:", rows.length - 1);
}

console.log("Relation dedupe completed.");
console.log({ deleted });

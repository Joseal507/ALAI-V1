import Database from "better-sqlite3";

const db = new Database("data/alai.db");

const groups = db.prepare(`
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

for (const group of groups) {
  const rows = db.prepare(`
    SELECT id
    FROM relations
    WHERE from_concept_id = ?
      AND to_concept_id = ?
      AND relation_type = ?
    ORDER BY confidence_score DESC, updated_at DESC, created_at DESC
  `).all(group.from_concept_id, group.to_concept_id, group.relation_type) as { id: string }[];

  for (const row of rows.slice(1)) {
    db.prepare(`DELETE FROM relations WHERE id = ?`).run(row.id);
    deleted++;
  }
}

console.log("Hard relation dedupe completed.");
console.log({ duplicateGroups: groups.length, deleted });

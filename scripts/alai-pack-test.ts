import Database from "better-sqlite3";

const db = new Database("data/alai.db");

const rows = db.prepare(`
SELECT
  c.name,
  p.short_summary,
  p.technical_explanation,
  p.canonical_example
FROM canonical_concept_packs p
JOIN concepts c ON c.id = p.concept_id
ORDER BY c.name
LIMIT 20
`).all();

console.table(rows);

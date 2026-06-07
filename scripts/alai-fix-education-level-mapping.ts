import Database from "better-sqlite3";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

function levelId(name: string): string | null {
  const row = db.prepare(`
    SELECT id FROM education_levels
    WHERE lower(name) = lower(?)
    LIMIT 1
  `).get(name) as { id: string } | undefined;

  return row?.id || null;
}

const undergraduate = levelId("undergraduate");
const media = levelId("media");
const premedia = levelId("premedia");

let updated = 0;

if (undergraduate) {
  const result = db.prepare(`
    UPDATE curriculum_topics
    SET education_level_id = ?,
        updated_at = ?
    WHERE lower(name) IN (
      'abstract algebra',
      'group theory',
      'vector spaces',
      'linear algebra'
    )
  `).run(undergraduate, now);

  updated += result.changes;
}

if (media) {
  const result = db.prepare(`
    UPDATE curriculum_topics
    SET education_level_id = ?,
        updated_at = ?
    WHERE lower(name) IN (
      'algebraic manipulation'
    )
  `).run(media, now);

  updated += result.changes;
}

if (premedia) {
  const result = db.prepare(`
    UPDATE curriculum_topics
    SET education_level_id = ?,
        updated_at = ?
    WHERE lower(name) IN (
      'elementary algebra',
      'linear equations',
      'graphing linear equations',
      'coordinate geometry'
    )
  `).run(premedia, now);

  updated += result.changes;
}

console.log("Education level mapping fixed.");
console.log({ updated });

console.table(db.prepare(`
SELECT
  e.name AS level,
  COUNT(t.id) AS topics
FROM education_levels e
LEFT JOIN curriculum_topics t ON t.education_level_id = e.id
GROUP BY e.id
ORDER BY e.order_index
`).all());

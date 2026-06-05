import Database from "better-sqlite3";

const db = new Database("data/alai.db");

const gaps = db.prepare(`
  SELECT id, gap_description AS description
  FROM knowledge_gaps
  WHERE status = 'OPEN'
`).all() as { id: string; description: string }[];

let closed = 0;
let skipped = 0;

for (const gap of gaps) {
  const text = gap.description.toLowerCase();

  const torqueAngularMomentumGap =
    text.includes("torque") &&
    (text.includes("momento angular") || text.includes("angular momentum"));

  if (!torqueAngularMomentumGap) {
    skipped++;
    continue;
  }

  const evidence = db.prepare(`
    SELECT COUNT(*) AS count
    FROM concepts
    WHERE lower(name) IN (
      'torque',
      'angular momentum',
      'euler''s equations',
      'rigid body dynamics'
    )
  `).get() as { count: number };

  const relation = db.prepare(`
    SELECT COUNT(*) AS count
    FROM relations
    JOIN concepts source ON source.id = relations.from_concept_id
    JOIN concepts target ON target.id = relations.to_concept_id
    WHERE (
      lower(source.name) LIKE '%torque%'
      OR lower(target.name) LIKE '%torque%'
      OR lower(source.name) LIKE '%angular momentum%'
      OR lower(target.name) LIKE '%angular momentum%'
    )
  `).get() as { count: number };

  if (evidence.count >= 2 && relation.count >= 2) {
    db.prepare(`
      UPDATE knowledge_gaps
      SET status = 'RESOLVED',
          updated_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), gap.id);

    closed++;
  } else {
    skipped++;
  }
}

console.log("Gap closure completed.");
console.log({ closed, skipped });

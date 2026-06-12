import Database from "better-sqlite3";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

const weakRelations = db.prepare(`
SELECT relation_id
FROM alai_semantic_relation_flags
WHERE status='OPEN'
  AND relation_id IS NOT NULL
LIMIT 1000
`).all() as { relation_id: string }[];

let demoted = 0;
let closedFlags = 0;

for (const row of weakRelations) {
  const result = db.prepare(`
    UPDATE relations
    SET confidence_score = MIN(confidence_score, 0.25),
        updated_at=?
    WHERE id=?
  `).run(now, row.relation_id);

  demoted += result.changes;
}

closedFlags = db.prepare(`
UPDATE alai_semantic_relation_flags
SET status='RESOLVED',
    updated_at=?
WHERE status='OPEN'
  AND relation_id IS NOT NULL
`).run(now).changes;

console.log("ALAI semantic truth repair completed.");
console.log({ demoted, closedFlags });

console.table(db.prepare(`
SELECT status, COUNT(*) AS count
FROM alai_semantic_relation_flags
GROUP BY status
`).all());

db.close();

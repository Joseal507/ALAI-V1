import Database from "better-sqlite3";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

function conceptId(name: string): string | null {
  const row = db.prepare(`
    SELECT id FROM concepts
    WHERE lower(name) = lower(?)
    LIMIT 1
  `).get(name) as { id: string } | undefined;

  return row?.id || null;
}

const euclideanVector = conceptId("Euclidean Vector");
const vectorSpace = conceptId("Vector Space");
const vector = conceptId("Vector");

let relationsFixed = 0;

if (euclideanVector && vectorSpace) {
  const badRelations = db.prepare(`
    SELECT id
    FROM relations
    WHERE from_concept_id = ?
      AND to_concept_id = ?
      AND relation_type IN ('IS_A', 'PART_OF')
  `).all(euclideanVector, vectorSpace) as { id: string }[];

  for (const relation of badRelations) {
    db.prepare(`
      UPDATE relations
      SET relation_type = 'RELATED_TO',
          description = 'A Euclidean vector is related to vector spaces, but it is not itself a vector space.',
          confidence_score = 0.42,
          updated_at = ?
      WHERE id = ?
    `).run(now, relation.id);

    relationsFixed++;
  }
}

if (euclideanVector && vector) {
  const exists = db.prepare(`
    SELECT id
    FROM relations
    WHERE from_concept_id = ?
      AND to_concept_id = ?
      AND relation_type = 'IS_A'
    LIMIT 1
  `).get(euclideanVector, vector) as { id: string } | undefined;

  if (!exists) {
    db.prepare(`
      INSERT INTO relations (
        id,
        from_concept_id,
        to_concept_id,
        relation_type,
        description,
        confidence_score,
        created_at,
        updated_at
      )
      VALUES (lower(hex(randomblob(16))), ?, ?, 'IS_A', ?, 0.78, ?, ?)
    `).run(
      euclideanVector,
      vector,
      "Euclidean Vector is a specific kind or representation of Vector.",
      now,
      now
    );

    relationsFixed++;
  }
}

const flagUpdate = db.prepare(`
  UPDATE alai_quality_flags
  SET status = 'RESOLVED',
      updated_at = ?
  WHERE status = 'OPEN'
    AND issue_type = 'CONTRADICTION'
    AND message LIKE '%Euclidean Vector%'
    AND message LIKE '%Vector Space%'
`).run(now);

console.log("Known contradiction resolver completed.");
console.log({
  relationsFixed,
  flagsClosed: flagUpdate.changes,
});

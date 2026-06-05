import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");

const aliasRelations = db.prepare(`
  SELECT
    relations.id AS relationId,
    source.id AS sourceConceptId,
    source.name AS sourceConceptName,
    target.id AS aliasConceptId,
    target.name AS aliasConceptName
  FROM relations
  JOIN concepts AS source ON source.id = relations.from_concept_id
  JOIN concepts AS target ON target.id = relations.to_concept_id
  WHERE relations.relation_type = 'ALIAS_OF'
`).all() as {
  relationId: string;
  sourceConceptId: string;
  sourceConceptName: string;
  aliasConceptId: string;
  aliasConceptName: string;
}[];

let merged = 0;
let skipped = 0;

const tx = db.transaction((item: typeof aliasRelations[number]) => {
  if (item.sourceConceptId === item.aliasConceptId) {
    skipped++;
    return;
  }

  const aliasStillExists = db.prepare(`
    SELECT id FROM concepts
    WHERE id = ?
    LIMIT 1
  `).get(item.aliasConceptId) as { id: string } | undefined;

  if (!aliasStillExists) {
    skipped++;
    return;
  }

  const existingAlias = db.prepare(`
    SELECT id FROM concept_aliases
    WHERE concept_id = ?
      AND lower(alias) = lower(?)
    LIMIT 1
  `).get(item.sourceConceptId, item.aliasConceptName) as { id: string } | undefined;

  if (!existingAlias) {
    db.prepare(`
      INSERT INTO concept_aliases (
        id,
        concept_id,
        alias,
        created_at
      ) VALUES (?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      item.sourceConceptId,
      item.aliasConceptName,
      new Date().toISOString()
    );
  }

  db.prepare(`
    UPDATE concept_evidence
    SET concept_id = ?
    WHERE concept_id = ?
  `).run(item.sourceConceptId, item.aliasConceptId);

  db.prepare(`
    UPDATE capabilities
    SET concept_id = ?
    WHERE concept_id = ?
  `).run(item.sourceConceptId, item.aliasConceptId);

  db.prepare(`
    UPDATE concept_aliases
    SET concept_id = ?
    WHERE concept_id = ?
  `).run(item.sourceConceptId, item.aliasConceptId);

  db.prepare(`
    UPDATE relations
    SET from_concept_id = ?
    WHERE from_concept_id = ?
  `).run(item.sourceConceptId, item.aliasConceptId);

  db.prepare(`
    UPDATE relations
    SET to_concept_id = ?
    WHERE to_concept_id = ?
  `).run(item.sourceConceptId, item.aliasConceptId);

  db.prepare(`
    DELETE FROM relations
    WHERE from_concept_id = to_concept_id
       OR id = ?
  `).run(item.relationId);

  db.prepare(`
    DELETE FROM concepts
    WHERE id = ?
  `).run(item.aliasConceptId);

  merged++;
  console.log("Merged alias concept:", item.aliasConceptName, "->", item.sourceConceptName);
});

for (const item of aliasRelations) {
  tx(item);
}

console.log("Alias concept merge completed.");
console.log({ merged, skipped });

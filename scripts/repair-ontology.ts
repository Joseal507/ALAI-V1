import Database from "better-sqlite3";
import { classifyRelationOntology } from "../src/ontology/relation-classifier";

const db = new Database("data/alai.db");

const rows = db.prepare(`
  SELECT
    relations.id,
    relations.relation_type AS relationType,
    relations.description,
    source.name AS fromConcept,
    target.name AS toConcept
  FROM relations
  JOIN concepts AS source ON source.id = relations.from_concept_id
  JOIN concepts AS target ON target.id = relations.to_concept_id
`).all() as {
  id: string;
  relationType: string;
  description: string;
  fromConcept: string;
  toConcept: string;
}[];

let converted = 0;
let deleted = 0;
let kept = 0;

for (const row of rows) {
  const decision = classifyRelationOntology({
    fromConcept: row.fromConcept,
    toConcept: row.toConcept,
    relationType: row.relationType,
    description: row.description,
  });

  if (!decision.accepted) {
    db.prepare(`DELETE FROM relations WHERE id = ?`).run(row.id);
    deleted++;
    console.log("Deleted:", row.fromConcept, row.relationType, row.toConcept, decision.reason);
    continue;
  }

  if (decision.relationType !== row.relationType) {
    db.prepare(`
      UPDATE relations
      SET relation_type = ?,
          updated_at = ?
      WHERE id = ?
    `).run(decision.relationType, new Date().toISOString(), row.id);

    converted++;
    console.log("Converted:", row.fromConcept, row.relationType, "=>", decision.relationType, row.toConcept);
    continue;
  }

  kept++;
}

console.log("Ontology repair completed.");
console.log({ converted, deleted, kept });

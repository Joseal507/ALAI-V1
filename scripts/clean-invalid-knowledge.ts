import Database from "better-sqlite3";

const db = new Database("data/alai.db");

const bannedConceptNames = [
  "NASA",
  "Physics LibreTexts",
];

const invalidRelationTypes = [
  "BIOMIMICS",
];

let deletedConcepts = 0;
let deletedRelations = 0;

for (const relationType of invalidRelationTypes) {
  const result = db.prepare(`
    DELETE FROM relations
    WHERE relation_type = ?
  `).run(relationType);

  deletedRelations += result.changes;
}

for (const conceptName of bannedConceptNames) {
  const concept = db.prepare(`
    SELECT id FROM concepts
    WHERE lower(name) = lower(?)
    LIMIT 1
  `).get(conceptName) as { id: string } | undefined;

  if (!concept) continue;

  db.prepare(`
    DELETE FROM relations
    WHERE from_concept_id = ?
       OR to_concept_id = ?
  `).run(concept.id, concept.id);

  db.prepare(`
    DELETE FROM concept_aliases
    WHERE concept_id = ?
  `).run(concept.id);

  db.prepare(`
    DELETE FROM concept_evidence
    WHERE concept_id = ?
  `).run(concept.id);

  const result = db.prepare(`
    DELETE FROM concepts
    WHERE id = ?
  `).run(concept.id);

  deletedConcepts += result.changes;
}

console.log("Invalid knowledge cleanup completed.");
console.log({ deletedConcepts, deletedRelations });

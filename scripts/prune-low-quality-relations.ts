import Database from "better-sqlite3";

const db = new Database("data/alai.db");

const invalidPairs = [
  ["Torque", "Linear Force", "IS_A"],
  ["Torque", "Moment", "IS_A"],
  ["Torque", "Physics", "IS_A"],
  ["Torque", "Physics", "RELATED_TO"],
  ["Torque", "Engineering", "RELATED_TO"],
];

let deletedRelations = 0;

for (const [fromName, toName, relationType] of invalidPairs) {
  const result = db.prepare(`
    DELETE FROM relations
    WHERE relation_type = ?
      AND from_concept_id IN (
        SELECT id FROM concepts WHERE lower(name) = lower(?)
      )
      AND to_concept_id IN (
        SELECT id FROM concepts WHERE lower(name) = lower(?)
      )
  `).run(relationType, fromName, toName);

  deletedRelations += result.changes;
}

console.log("Low quality relation pruning completed.");
console.log({ deletedRelations });

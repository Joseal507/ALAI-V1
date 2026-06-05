import Database from "better-sqlite3";

const db = new Database("data/alai.db");

const result = db.prepare(`
  DELETE FROM relations
  WHERE relation_type = 'IS_A'
    AND from_concept_id IN (
      SELECT concept_id
      FROM concept_aliases
      WHERE lower(alias) = lower((
        SELECT name
        FROM concepts
        WHERE concepts.id = relations.to_concept_id
      ))
    )
`).run();

console.log("Alias relation pruning completed.");
console.log({ deleted: result.changes });

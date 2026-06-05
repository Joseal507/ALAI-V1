import Database from "better-sqlite3";

const db = new Database("data/alai.db");

const concepts = db
  .prepare(
    `
    SELECT
      id,
      name,
      description,
      status,
      confidence_score,
      uncertainty_score,
      created_at,
      updated_at
    FROM concepts
    ORDER BY created_at ASC
  `
  )
  .all();

const relations = db
  .prepare(
    `
    SELECT
      relations.id,
      source.name AS from_name,
      target.name AS to_name,
      relations.relation_type,
      relations.description,
      relations.confidence_score
    FROM relations
    JOIN concepts AS source ON source.id = relations.from_concept_id
    JOIN concepts AS target ON target.id = relations.to_concept_id
    ORDER BY relations.created_at ASC
  `
  )
  .all();

console.log("\n=== ALAI Concepts ===");
console.table(concepts);

console.log("\n=== ALAI Relations ===");
console.table(relations);

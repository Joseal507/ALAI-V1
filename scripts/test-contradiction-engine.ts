import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

function getConcept(name: string) {
  return db.prepare(`
    SELECT id
    FROM concepts
    WHERE lower(name) = lower(?)
    LIMIT 1
  `).get(name) as { id: string } | undefined;
}

const vector = getConcept("Vector");
const vectorSpaces = getConcept("Vector Spaces");

if (!vector || !vectorSpaces) {
  throw new Error("Missing Vector or Vector Spaces concept.");
}

const relationRows = [
  {
    type: "PART_OF",
    description: "Intentional test: Vector is part of Vector Spaces.",
    confidence: 0.72,
  },
  {
    type: "ALIAS_OF",
    description: "Intentional test contradiction: Vector is treated as alias of Vector Spaces.",
    confidence: 0.51,
  },
];

for (const relation of relationRows) {
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
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    vector.id,
    vectorSpaces.id,
    relation.type,
    relation.description,
    relation.confidence,
    now,
    now
  );
}

console.log("Inserted intentional contradiction: Vector PART_OF Vector Spaces vs Vector ALIAS_OF Vector Spaces");

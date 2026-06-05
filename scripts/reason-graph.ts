import Database from "better-sqlite3";
import crypto from "node:crypto";
import { inferGraphRelations } from "../src/reasoning/graph-reasoning-engine";

const db = new Database("data/alai.db");

const inferred = inferGraphRelations(db);

let inserted = 0;
let skipped = 0;

for (const relation of inferred) {
  const existing = db.prepare(`
    SELECT id
    FROM relations
    WHERE from_concept_id = ?
      AND to_concept_id = ?
      AND relation_type = ?
    LIMIT 1
  `).get(
    relation.fromConceptId,
    relation.toConceptId,
    relation.relationType
  ) as { id: string } | undefined;

  if (existing) {
    skipped++;
    continue;
  }

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
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    relation.fromConceptId,
    relation.toConceptId,
    relation.relationType,
    relation.description,
    relation.confidenceScore,
    new Date().toISOString(),
    new Date().toISOString()
  );

  inserted++;
}

console.log("Graph reasoning completed.");
console.log({ inferred: inferred.length, inserted, skipped });

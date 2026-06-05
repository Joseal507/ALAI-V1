import Database from "better-sqlite3";
import crypto from "node:crypto";
import { suggestConceptConsolidation } from "../src/consolidation/concept-consolidation-engine";

const db = new Database("data/alai.db");

const concepts = db.prepare(`
  SELECT id, name, description
  FROM concepts
  ORDER BY created_at ASC
`).all() as {
  id: string;
  name: string;
  description: string;
}[];

const suggestions = suggestConceptConsolidation(concepts)
  .filter((suggestion) => suggestion.action === "ADD_ALIAS");

let inserted = 0;
let skipped = 0;

for (const suggestion of suggestions) {
  const existing = db.prepare(`
    SELECT id
    FROM concept_aliases
    WHERE concept_id = ?
      AND lower(alias) = lower(?)
    LIMIT 1
  `).get(
    suggestion.targetConcept.id,
    suggestion.sourceConcept.name
  ) as { id: string } | undefined;

  if (existing) {
    skipped++;
    continue;
  }

  db.prepare(`
    INSERT INTO concept_aliases (
      id,
      concept_id,
      alias,
      created_at
    ) VALUES (?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    suggestion.targetConcept.id,
    suggestion.sourceConcept.name,
    new Date().toISOString()
  );

  inserted++;
}

console.log("Alias consolidation completed.");
console.log({ inserted, skipped });

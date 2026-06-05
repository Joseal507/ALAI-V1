import Database from "better-sqlite3";
import { rankConcept } from "../src/learning/concept-rank-engine";

const db = new Database("data/alai.db");

const concepts = db.prepare(`
  SELECT id, name, description, status
  FROM concepts
`).all() as {
  id: string;
  name: string;
  description: string;
  status: string;
}[];

let deleted = 0;
let skipped = 0;

for (const concept of concepts) {
  const rank = rankConcept(concept.name, concept.description);

  if (rank !== "NOISE") {
    skipped++;
    continue;
  }

  db.prepare(`
    DELETE FROM relations
    WHERE from_concept_id = ?
       OR to_concept_id = ?
  `).run(concept.id, concept.id);

  db.prepare(`DELETE FROM concept_evidence WHERE concept_id = ?`).run(concept.id);
  db.prepare(`DELETE FROM capabilities WHERE concept_id = ?`).run(concept.id);
  db.prepare(`DELETE FROM concept_aliases WHERE concept_id = ?`).run(concept.id);
  db.prepare(`DELETE FROM knowledge_gaps WHERE concept_id = ?`).run(concept.id);
  db.prepare(`DELETE FROM concepts WHERE id = ?`).run(concept.id);

  deleted++;
  console.log("Deleted noise concept:", concept.name);
}

console.log("Noise concept pruning completed.");
console.log({ deleted, skipped });

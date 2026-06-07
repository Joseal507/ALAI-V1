import Database from "better-sqlite3";
import { recalculateConceptGovernance } from "../src/alai/alai-knowledge-governance";

const db = new Database("data/alai.db");

const row = db.prepare(`
  SELECT id
  FROM concepts
  WHERE lower(name) = lower(?)
  LIMIT 1
`).get("Vector") as { id: string } | undefined;

if (!row) {
  console.log("Vector not found.");
  process.exit(0);
}

console.log(recalculateConceptGovernance(db, row.id));

console.table(db.prepare(`
  SELECT example_text, confidence_score
  FROM canonical_examples
  WHERE concept_id = ?
`).all(row.id));

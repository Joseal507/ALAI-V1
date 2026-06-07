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

const result = recalculateConceptGovernance(db, row.id);
console.log(result);

console.table(db.prepare(`
  SELECT name, status, confidence_score, description
  FROM concepts
  WHERE id = ?
`).all(row.id));

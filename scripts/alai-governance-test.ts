import Database from "better-sqlite3";
import { recalculateConceptGovernance } from "../src/alai/alai-knowledge-governance";

const db = new Database("data/alai.db");

const row = db.prepare(`
  SELECT id FROM concepts
  WHERE lower(name) = lower(?)
  LIMIT 1
`).get("Vector") as { id: string } | undefined;

if (!row) {
  console.log("Vector not found.");
  process.exit(0);
}

console.log(recalculateConceptGovernance(db, row.id));

console.table(db.prepare(`
  SELECT c.name, c.status, c.confidence_score, cm.mastery_score, cm.mastery_level,
         cm.evidence_count, cm.relation_count
  FROM concepts c
  LEFT JOIN concept_mastery cm ON cm.concept_id = c.id
  WHERE c.id = ?
`).all(row.id));

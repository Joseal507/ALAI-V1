import Database from "better-sqlite3";
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

const suggestions = suggestConceptConsolidation(concepts);

console.log("\n=== ALAI Consolidation Suggestions ===");

if (suggestions.length === 0) {
  console.log("No consolidation suggestions found.");
  process.exit(0);
}

console.table(
  suggestions.map((suggestion) => ({
    action: suggestion.action,
    source: suggestion.sourceConcept.name,
    target: suggestion.targetConcept.name,
    confidence: suggestion.confidence,
    reason: suggestion.reason,
  }))
);

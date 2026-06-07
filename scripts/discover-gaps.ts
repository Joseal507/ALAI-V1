import Database from "better-sqlite3";
import { discoverKnowledgeGaps } from "../src/autonomy/gap-discovery-engine";

const db = new Database("data/alai.db");

const result = discoverKnowledgeGaps(db, 50);

console.log("\n=== ALAI Gap Discovery ===");
console.log({
  created: result.created.length,
  skipped: result.skipped,
});

console.table(result.created.slice(0, 25));

import Database from "better-sqlite3";
import { calculateKnowledgeConfidenceFromDb } from "../src/confidence/knowledge-confidence-from-db";

const question = process.argv.slice(2).join(" ").trim();

if (!question) {
  console.error('Usage: npm run confidence:test -- "question"');
  process.exit(1);
}

const db = new Database("data/alai.db");
const result = calculateKnowledgeConfidenceFromDb(db, question);

console.log("\n=== ALAI Knowledge Confidence ===");
console.log(JSON.stringify({ question, ...result }, null, 2));

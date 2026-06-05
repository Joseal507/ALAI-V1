import Database from "better-sqlite3";
import { learnLanguagePattern } from "../src/language/language-learning-engine";

const [instruction, previousResponse, improvedResponse] = process.argv.slice(2);

if (!instruction || !previousResponse || !improvedResponse) {
  console.error('Usage: npm run language:feedback -- "instruction" "previous response" "improved response"');
  process.exit(1);
}

const db = new Database("data/alai.db");

const pattern = learnLanguagePattern(db, {
  userInstruction: instruction,
  previousResponse,
  improvedResponse,
});

console.log("Learned language feedback:");
console.log(JSON.stringify(pattern, null, 2));

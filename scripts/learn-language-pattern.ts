import Database from "better-sqlite3";
import { learnLanguagePattern } from "../src/language/language-learning-engine";

const instruction = process.argv.slice(2).join(" ").trim();

if (!instruction) {
  console.error('Usage: npm run language:learn -- "dímelo más corto y casual"');
  process.exit(1);
}

const db = new Database("data/alai.db");

const pattern = learnLanguagePattern(db, {
  userInstruction: instruction,
});

console.log("Learned language pattern:");
console.log(JSON.stringify(pattern, null, 2));

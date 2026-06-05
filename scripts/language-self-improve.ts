import Database from "better-sqlite3";
import { improveLanguageFromFeedback } from "../src/language/language-self-improvement-engine";

const feedback = process.argv.slice(2).join(" ").trim();

if (!feedback) {
  console.error('Usage: npm run language:self-improve -- "hazlo más profesional y claro"');
  process.exit(1);
}

const db = new Database("data/alai.db");

const result = improveLanguageFromFeedback(db, feedback);

console.log("Language self-improvement completed.");
console.log(JSON.stringify(result, null, 2));

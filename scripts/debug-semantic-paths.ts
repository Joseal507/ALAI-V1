import Database from "better-sqlite3";
import { reasonAboutQuestion } from "../src/reasoning/question-reasoner";

const question = process.argv.slice(2).join(" ").trim();

if (!question) {
  console.error('Usage: npx tsx scripts/debug-semantic-paths.ts "question"');
  process.exit(1);
}

const db = new Database("data/alai.db");
const reasoning = reasonAboutQuestion(db, question);

console.log("QUESTION:", question);
console.log("");
console.log("DETECTED CONCEPTS:");
console.table(reasoning.detectedConcepts.map((c) => ({
  name: c.name,
  status: c.status,
  confidence: c.confidenceScore,
})));

console.log("");
console.log("PATHS:");
console.table(reasoning.reasoningPaths.map((p, index) => ({
  index,
  from: p.fromConcept,
  to: p.toConcept,
  confidence: p.confidenceScore,
  steps: p.steps.length,
  path: p.steps.map((s) => `${s.fromName} --${s.relationType}--> ${s.toName}`).join(" | "),
  descriptions: p.steps.map((s) => s.description).join(" | "),
})));

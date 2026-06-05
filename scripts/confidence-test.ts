import Database from "better-sqlite3";
import { calculateKnowledgeConfidence } from "../src/confidence/knowledge-confidence-engine";

const question = process.argv.slice(2).join(" ").trim();

if (!question) {
  console.error('Usage: npm run confidence:test -- "question"');
  process.exit(1);
}

const db = new Database("data/alai.db");

const concepts = db.prepare(`
  SELECT COUNT(*) AS count
  FROM concepts
  WHERE lower(?) LIKE '%' || lower(name) || '%'
`).get(question) as { count: number };

const evidence = db.prepare(`
  SELECT COUNT(*) AS count
  FROM evidence
`).get() as { count: number };

const gaps = db.prepare(`
  SELECT COUNT(*) AS count
  FROM knowledge_gaps
  WHERE status = 'OPEN'
`).get() as { count: number };

const result = calculateKnowledgeConfidence({
  concepts: concepts.count,
  evidence: evidence.count,
  openGaps: gaps.count,
});

console.log("\n=== ALAI Knowledge Confidence ===");
console.log(JSON.stringify({ question, ...result }, null, 2));

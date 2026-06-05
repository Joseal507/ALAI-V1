import Database from "better-sqlite3";

const db = new Database("data/alai.db");

const gaps = db.prepare(`
  SELECT
    id,
    gap_description,
    priority_score,
    status,
    created_at
  FROM knowledge_gaps
  WHERE status = 'OPEN'
  ORDER BY priority_score DESC, created_at ASC
  LIMIT 5
`).all();

console.log("\n=== ALAI Study Plan v1 ===");

if (gaps.length === 0) {
  console.log("No open knowledge gaps found.");
  process.exit(0);
}

console.table(gaps);

console.log("\nRecommended action:");
console.log("Study the highest priority gap first, then create evidence before updating the World Model.");

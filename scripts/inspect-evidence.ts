import Database from "better-sqlite3";

const db = new Database("data/alai.db");

const evidence = db.prepare(`
  SELECT
    id,
    source_type,
    source_name,
    content_summary,
    reliability_score,
    captured_at
  FROM evidence
  ORDER BY captured_at DESC
`).all();

console.log("\n=== ALAI Evidence ===");
console.table(evidence);

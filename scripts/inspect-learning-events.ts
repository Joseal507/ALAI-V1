import Database from "better-sqlite3";

const db = new Database("data/alai.db");

const events = db.prepare(`
  SELECT
    id,
    event_type,
    trigger_source,
    summary,
    confidence_before,
    confidence_after,
    created_at
  FROM learning_events
  ORDER BY created_at DESC
`).all();

console.log("\n=== ALAI Learning Events ===");
console.table(events);

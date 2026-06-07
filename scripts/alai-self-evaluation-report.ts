import Database from "better-sqlite3";

const db = new Database("data/alai.db");

const table = db.prepare(`
  SELECT name
  FROM sqlite_master
  WHERE type = 'table'
    AND name = 'alai_response_evaluations'
  LIMIT 1
`).get();

if (!table) {
  console.log("No self evaluations yet.");
  process.exit(0);
}

const rows = db.prepare(`
  SELECT
    mode,
    score,
    reason,
    should_research,
    should_rewrite,
    substr(user_message, 1, 60) AS user_message,
    substr(answer, 1, 90) AS answer
  FROM alai_response_evaluations
  ORDER BY created_at DESC
  LIMIT 20
`).all();

console.table(rows);

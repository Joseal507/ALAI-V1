import Database from "better-sqlite3";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.prepare(`
  UPDATE autonomous_learning_queue
  SET priority_score = 0.99,
      updated_at = ?
  WHERE lower(objective) = lower('Algebra')
    AND status = 'OPEN'
`).run(now);

db.prepare(`
  UPDATE autonomous_learning_queue
  SET priority_score = 0.4,
      updated_at = ?
  WHERE objective LIKE 'Map the major branches,%'
    AND status = 'OPEN'
`).run(now);

console.log("Prepared Algebra pilot.");

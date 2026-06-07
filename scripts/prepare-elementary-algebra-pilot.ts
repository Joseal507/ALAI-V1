import Database from "better-sqlite3";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.prepare(`
  UPDATE autonomous_learning_queue
  SET priority_score = 0.2,
      updated_at = ?
  WHERE status = 'OPEN'
`).run(now);

for (const objective of [
  "Elementary Algebra",
  "Linear Equations",
  "Quadratic Equations"
]) {
  db.prepare(`
    UPDATE autonomous_learning_queue
    SET priority_score = 0.99,
        updated_at = ?
    WHERE lower(objective) = lower(?)
      AND status = 'OPEN'
  `).run(now, objective);
}

console.log("Prepared Elementary Algebra pilot.");

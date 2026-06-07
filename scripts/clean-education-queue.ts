import Database from "better-sqlite3";

const db = new Database("data/alai.db");

const blocked = [
  "Pre-Middle Education",
  "Middle Education",
  "High School Education",
  "University Education",
  "Vocational Training",
  "Special Education",
];

let updated = 0;

for (const objective of blocked) {
  const result = db.prepare(`
    UPDATE autonomous_learning_queue
    SET status = 'FAILED',
        updated_at = ?
    WHERE lower(objective) = lower(?)
      AND status = 'OPEN'
  `).run(new Date().toISOString(), objective);

  updated += result.changes;
}

console.log("Cleaned education-stage queue items.");
console.log({ updated });

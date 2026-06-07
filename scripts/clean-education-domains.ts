import Database from "better-sqlite3";

const db = new Database("data/alai.db");

const badNames = [
  "Primary Education",
  "Pre-Middle Education",
  "Middle Education",
  "High School Education",
  "University Education",
  "Vocational Training",
];

let deleted = 0;

for (const name of badNames) {
  const result = db.prepare(`
    DELETE FROM academic_domains
    WHERE lower(name) = lower(?)
      AND confidence_score <= 0.35
  `).run(name);

  deleted += result.changes;
}

console.log("Cleaned education-stage domains.");
console.log({ deleted });

import Database from "better-sqlite3";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

const ambiguousObjectives = [
  "Map universal education levels from preschool through doctorate, including subjects, disciplines, careers, and specializations.",
  "Technical Education",
  "Graduate Studies",
  "Professional Certification",
  "Apprenticeships",
  "Certification Programs",
];

let paused = 0;

for (const objective of ambiguousObjectives) {
  const result = db.prepare(`
    UPDATE autonomous_learning_queue
    SET status = 'FAILED',
        updated_at = ?
    WHERE lower(objective) = lower(?)
      AND status = 'OPEN'
  `).run(now, objective);

  paused += result.changes;
}

const mathObjective =
  "Map the major branches, subbranches, topics, prerequisites, and core concepts of Mathematics across all education levels.";

db.prepare(`
  UPDATE autonomous_learning_queue
  SET priority_score = 0.99,
      updated_at = ?
  WHERE objective = ?
    AND status = 'OPEN'
`).run(now, mathObjective);

console.log("Prepared Mathematics pilot.");
console.log({ pausedAmbiguousObjectives: paused });

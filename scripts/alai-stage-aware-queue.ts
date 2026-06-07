import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

const current = db.prepare(`
  SELECT gs.stage_name AS stage_name
  FROM alai_current_state s
  JOIN alai_growth_stage gs ON gs.id = s.current_growth_stage_id
  LIMIT 1
`).get() as { stage_name: string } | undefined;

if (!current) {
  throw new Error("ALAI current state not found. Run npm run alai:seed-state first.");
}

if (current.stage_name !== "Academic Baby") {
  console.log("Stage-aware queue skipped. Current stage is not Academic Baby.");
  console.log(current);
  process.exit(0);
}

db.prepare(`
  UPDATE autonomous_learning_queue
  SET priority_score = 0.05
  WHERE status = 'OPEN'
    AND objective NOT IN (
      'Objects',
      'Colors',
      'Shapes',
      'Numbers',
      'Counting',
      'Comparison',
      'Patterns',
      'Animals',
      'Food',
      'Family',
      'Body Parts',
      'Emotions',
      'Basic Actions',
      'Letters',
      'Words',
      'Simple Sentences'
    )
`).run();

const babyObjectives = [
  ["Objects", 0.99],
  ["Colors", 0.98],
  ["Shapes", 0.97],
  ["Numbers", 0.96],
  ["Counting", 0.95],
  ["Comparison", 0.94],
  ["Patterns", 0.93],
  ["Animals", 0.92],
  ["Food", 0.91],
  ["Family", 0.9],
  ["Body Parts", 0.89],
  ["Emotions", 0.88],
  ["Basic Actions", 0.87],
  ["Letters", 0.86],
  ["Words", 0.85],
  ["Simple Sentences", 0.84],
] as const;

const insertObjective = db.prepare(`
  INSERT INTO autonomous_learning_queue (
    id, objective, priority_score, status, attempts, created_at, updated_at
  )
  VALUES (?, ?, ?, 'OPEN', 0, ?, ?)
`);

const existing = db.prepare(`
  SELECT id FROM autonomous_learning_queue
  WHERE lower(objective) = lower(?)
  LIMIT 1
`);

const updatePriority = db.prepare(`
  UPDATE autonomous_learning_queue
  SET priority_score = ?,
      status = 'OPEN',
      updated_at = ?
  WHERE lower(objective) = lower(?)
`);

let inserted = 0;
let updated = 0;

for (const [objective, priority] of babyObjectives) {
  const found = existing.get(objective) as { id: string } | undefined;

  if (found) {
    updatePriority.run(priority, now, objective);
    updated++;
  } else {
    insertObjective.run(crypto.randomUUID(), objective, priority, now, now);
    inserted++;
  }
}

console.log("Stage-aware learning queue updated.");
console.log({
  stage: current.stage_name,
  inserted,
  updated,
  prioritizedObjectives: babyObjectives.length,
});

const queue = db.prepare(`
  SELECT objective, priority_score AS priority, status, attempts
  FROM autonomous_learning_queue
  WHERE status = 'OPEN'
  ORDER BY priority_score DESC, created_at ASC
  LIMIT 25
`).all();

console.table(queue);

import Database from "better-sqlite3";
import { evaluateAutonomousLearningTarget } from "../src/autonomy/governance-brain";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_rejected_concepts (
  id TEXT PRIMARY KEY,
  concept_id TEXT,
  name TEXT NOT NULL,
  reason TEXT NOT NULL,
  score REAL NOT NULL,
  created_at TEXT NOT NULL
);
`);

const rows = db.prepare(`
SELECT id, name, description, status, confidence_score
FROM concepts
WHERE status = 'PENDING'
`).all() as {
  id: string;
  name: string;
  description: string;
  status: string;
  confidence_score: number;
}[];

let flagged = 0;

for (const row of rows) {
  const decision = evaluateAutonomousLearningTarget({
    name: row.name,
    description: row.description,
  });

  if (decision.allowed) continue;

  db.prepare(`
    INSERT OR IGNORE INTO alai_rejected_concepts (
      id, concept_id, name, reason, score, created_at
    )
    VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?)
  `).run(row.id, row.name, decision.reason, decision.score, now);

  db.prepare(`
    UPDATE concepts
    SET status = 'REJECTED',
        updated_at = ?
    WHERE id = ?
      AND status = 'PENDING'
  `).run(now, row.id);

  db.prepare(`
    UPDATE alai_research_questions
    SET status = 'REJECTED',
        updated_at = ?
    WHERE concept_id = ?
      AND status = 'OPEN'
  `).run(now, row.id);

  flagged++;
}

console.log("Blocked/noisy pending concepts rejected.");
console.log({ flagged });

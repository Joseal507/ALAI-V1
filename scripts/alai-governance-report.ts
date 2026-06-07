import Database from "better-sqlite3";
import { evaluateAutonomousLearningTarget } from "../src/autonomy/governance-brain";

const db = new Database("data/alai.db");

const rows = db.prepare(`
SELECT name, description, status, confidence_score
FROM concepts
ORDER BY updated_at DESC
LIMIT 80
`).all() as {
  name: string;
  description: string;
  status: string;
  confidence_score: number;
}[];

const report = rows.map((row) => {
  const decision = evaluateAutonomousLearningTarget({
    name: row.name,
    description: row.description,
  });

  return {
    name: row.name,
    status: row.status,
    confidence: row.confidence_score,
    allowed: decision.allowed ? "YES" : "NO",
    score: decision.score,
    reason: decision.reason,
  };
});

console.table(report);

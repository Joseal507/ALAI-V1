import Database from "better-sqlite3";
import crypto from "node:crypto";

const gap = process.argv.slice(2).join(" ").trim();

if (!gap) {
  console.error('Usage: npm run gap:create -- "description of the knowledge gap"');
  process.exit(1);
}

const db = new Database("data/alai.db");
const now = new Date().toISOString();

const id = crypto.randomUUID();

db.prepare(`
  INSERT INTO knowledge_gaps (
    id,
    concept_id,
    gap_description,
    priority_score,
    status,
    created_at,
    updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`).run(
  id,
  null,
  gap,
  0.7,
  "OPEN",
  now,
  now
);

console.log("Knowledge gap created.");
console.log({ id, gap });

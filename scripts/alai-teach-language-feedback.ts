import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

const [badPattern, correction, reason] = process.argv.slice(2);

if (!badPattern || !correction) {
  console.error('Usage: npm run alai:teach-language -- "bad pattern" "better correction" "reason"');
  process.exit(1);
}

db.exec(`
CREATE TABLE IF NOT EXISTS alai_language_feedback (
  id TEXT PRIMARY KEY,
  bad_pattern TEXT NOT NULL,
  correction TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);

db.prepare(`
  INSERT INTO alai_language_feedback (
    id,
    bad_pattern,
    correction,
    reason,
    status,
    created_at,
    updated_at
  )
  VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)
`).run(
  crypto.randomUUID(),
  badPattern,
  correction,
  reason || "",
  now,
  now
);

console.log("ALAI language feedback learned.");
console.log({
  badPattern,
  correction,
  reason: reason || "",
});

import Database from "better-sqlite3";
import crypto from "node:crypto";

const input = process.argv.slice(2).join(" ").trim();

if (!input) {
  console.error("Usage: npm run learn:intake -- \"text to analyze\"");
  process.exit(1);
}

const db = new Database("data/alai.db");

const now = new Date().toISOString();

const eventId = crypto.randomUUID();

db.prepare(`
  INSERT INTO learning_events (
    id,
    event_type,
    trigger_source,
    summary,
    confidence_before,
    confidence_after,
    created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`).run(
  eventId,
  "RAW_TEXT_INTAKE",
  "LOCAL_TERMINAL",
  input,
  null,
  null,
  now
);

console.log("Learning intake saved.");
console.log({ eventId, characters: input.length });

import Database from "better-sqlite3";
import crypto from "node:crypto";

const [sourceType, sourceName, ...summaryParts] = process.argv.slice(2);
const summary = summaryParts.join(" ").trim();

if (!sourceType || !sourceName || !summary) {
  console.error('Usage: npm run evidence:add -- "BOOK|PAPER|WEBSITE|AI_MODEL|DOCUMENT" "Source name" "Evidence summary"');
  process.exit(1);
}

const db = new Database("data/alai.db");
const now = new Date().toISOString();
const id = crypto.randomUUID();

db.prepare(`
  INSERT INTO evidence (
    id,
    source_type,
    source_name,
    source_url,
    content_summary,
    reliability_score,
    captured_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`).run(
  id,
  sourceType,
  sourceName,
  null,
  summary,
  0.5,
  now
);

console.log("Evidence added.");
console.log({ id, sourceType, sourceName, summary });

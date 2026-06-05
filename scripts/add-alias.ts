import Database from "better-sqlite3";
import crypto from "node:crypto";

const [conceptName, ...aliasParts] = process.argv.slice(2);
const alias = aliasParts.join(" ").trim();

if (!conceptName || !alias) {
  console.error('Usage: npm run alias:add -- "Concept name" "Alias"');
  process.exit(1);
}

const db = new Database("data/alai.db");

const concept = db.prepare(`
  SELECT id, name
  FROM concepts
  WHERE lower(name) = lower(?)
  LIMIT 1
`).get(conceptName) as { id: string; name: string } | undefined;

if (!concept) {
  console.error(`Concept not found: ${conceptName}`);
  process.exit(1);
}

db.prepare(`
  INSERT INTO concept_aliases (
    id,
    concept_id,
    alias,
    created_at
  ) VALUES (?, ?, ?, ?)
`).run(
  crypto.randomUUID(),
  concept.id,
  alias,
  new Date().toISOString()
);

console.log("Alias added.");
console.log({ concept: concept.name, alias });

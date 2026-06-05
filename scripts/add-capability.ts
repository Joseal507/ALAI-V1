import Database from "better-sqlite3";
import crypto from "node:crypto";

const [conceptName, capabilityType, ...descriptionParts] = process.argv.slice(2);
const description = descriptionParts.join(" ").trim();

if (!conceptName || !capabilityType || !description) {
  console.error('Usage: npm run capability:add -- "Concept name" "CAPABILITY_TYPE" "Description"');
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

const now = new Date().toISOString();

db.prepare(`
  INSERT INTO capabilities (
    id,
    concept_id,
    capability_type,
    description,
    mastery_score,
    last_tested_at,
    created_at,
    updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  crypto.randomUUID(),
  concept.id,
  capabilityType,
  description,
  0.35,
  now,
  now,
  now
);

console.log("Capability added.");
console.log({ concept: concept.name, capabilityType, description });

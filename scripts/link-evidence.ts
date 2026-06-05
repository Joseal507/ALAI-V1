import Database from "better-sqlite3";

const [conceptName, evidenceId] = process.argv.slice(2);

if (!conceptName || !evidenceId) {
  console.error('Usage: npm run evidence:link -- "Concept name" "Evidence ID"');
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
  INSERT OR IGNORE INTO concept_evidence (
    concept_id,
    evidence_id
  ) VALUES (?, ?)
`).run(concept.id, evidenceId);

console.log("Evidence linked.");
console.log({ concept: concept.name, evidenceId });

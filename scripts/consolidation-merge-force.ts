import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");

const sourceName = "Fuerza";
const targetName = "Force";

const source = db.prepare(`
  SELECT id, name FROM concepts
  WHERE lower(name) = lower(?)
  LIMIT 1
`).get(sourceName) as { id: string; name: string } | undefined;

const target = db.prepare(`
  SELECT id, name FROM concepts
  WHERE lower(name) = lower(?)
  LIMIT 1
`).get(targetName) as { id: string; name: string } | undefined;

if (!source || !target) {
  console.error("Source or target concept not found.", { sourceName, targetName });
  process.exit(1);
}

const tx = db.transaction(() => {
  db.prepare(`
    UPDATE relations
    SET from_concept_id = ?
    WHERE from_concept_id = ?
  `).run(target.id, source.id);

  db.prepare(`
    UPDATE relations
    SET to_concept_id = ?
    WHERE to_concept_id = ?
  `).run(target.id, source.id);

  db.prepare(`
    UPDATE concept_evidence
    SET concept_id = ?
    WHERE concept_id = ?
  `).run(target.id, source.id);

  db.prepare(`
    UPDATE capabilities
    SET concept_id = ?
    WHERE concept_id = ?
  `).run(target.id, source.id);

  db.prepare(`
    UPDATE concept_aliases
    SET concept_id = ?
    WHERE concept_id = ?
  `).run(target.id, source.id);

  const aliasExists = db.prepare(`
    SELECT id FROM concept_aliases
    WHERE concept_id = ?
      AND lower(alias) = lower(?)
    LIMIT 1
  `).get(target.id, source.name) as { id: string } | undefined;

  if (!aliasExists) {
    db.prepare(`
      INSERT INTO concept_aliases (
        id,
        concept_id,
        alias,
        created_at
      ) VALUES (?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      target.id,
      source.name,
      new Date().toISOString()
    );
  }

  db.prepare(`
    DELETE FROM concepts
    WHERE id = ?
  `).run(source.id);
});

tx();

console.log("Concept merge completed.");
console.log({ merged: source.name, into: target.name });

import Database from "better-sqlite3";
import { buildCanonicalPackContent } from "./alai-canonical-pack-builder";

export function ensureCanonicalPackTable(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS canonical_concept_packs (
      concept_id TEXT PRIMARY KEY,
      short_summary TEXT,
      technical_explanation TEXT,
      canonical_example TEXT,
      common_misconceptions TEXT,
      practical_uses TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

export function generateCanonicalPack(
  db: Database.Database,
  conceptId: string
) {
  ensureCanonicalPackTable(db);

  const concept = db.prepare(`
    SELECT id, name, description
    FROM concepts
    WHERE id = ?
    LIMIT 1
  `).get(conceptId) as
    | { id: string; name: string; description: string }
    | undefined;

  if (!concept) return null;

  const example = db.prepare(`
    SELECT example_text
    FROM canonical_examples
    WHERE concept_id = ?
    ORDER BY confidence_score DESC
    LIMIT 1
  `).get(conceptId) as { example_text: string } | undefined;

  const relations = db.prepare(`
    SELECT
      source.name AS fromConcept,
      r.relation_type AS relationType,
      target.name AS toConcept
    FROM relations r
    JOIN concepts source ON source.id = r.from_concept_id
    JOIN concepts target ON target.id = r.to_concept_id
    WHERE r.from_concept_id = ?
       OR r.to_concept_id = ?
    ORDER BY r.confidence_score DESC
    LIMIT 8
  `).all(conceptId, conceptId) as {
    fromConcept: string;
    relationType: string;
    toConcept: string;
  }[];

  const pack = buildCanonicalPackContent({
    conceptName: concept.name,
    description: concept.description,
    canonicalExample: example?.example_text,
    relations: relations.map((relation) => ({
      from: relation.fromConcept,
      type: relation.relationType,
      to: relation.toConcept,
    })),
  });

  const existing = db.prepare(`
    SELECT concept_id, created_at
    FROM canonical_concept_packs
    WHERE concept_id = ?
    LIMIT 1
  `).get(conceptId) as { concept_id: string; created_at: string } | undefined;

  const now = new Date().toISOString();

  db.prepare(`
    INSERT OR REPLACE INTO canonical_concept_packs (
      concept_id,
      short_summary,
      technical_explanation,
      canonical_example,
      common_misconceptions,
      practical_uses,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    conceptId,
    pack.shortSummary,
    pack.technicalExplanation,
    pack.canonicalExample,
    pack.commonMisconceptions,
    pack.practicalUses,
    existing?.created_at || now,
    now
  );

  return pack;
}

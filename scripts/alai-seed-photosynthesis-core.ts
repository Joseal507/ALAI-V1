import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

const conceptName = "Photosynthesis";

const existing = db.prepare(`
  SELECT id FROM concepts
  WHERE lower(name) IN ('photosynthesis', 'fotosintesis', 'fotosíntesis')
  LIMIT 1
`).get() as { id: string } | undefined;

const conceptId = existing?.id ?? crypto.randomUUID();

if (!existing) {
  db.prepare(`
    INSERT INTO concepts (
      id,
      name,
      description,
      concept_type,
      confidence_score,
      status,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, 'BIOLOGY_PROCESS', 0.92, 'VERIFIED', ?, ?)
  `).run(
    conceptId,
    conceptName,
    "Photosynthesis is the biological process by which plants, algae, and some bacteria convert light energy into chemical energy, using carbon dioxide and water to produce glucose and oxygen.",
    now,
    now
  );
}

db.prepare(`
  INSERT OR IGNORE INTO concept_aliases (
    id,
    concept_id,
    alias,
    confidence_score,
    created_at
  )
  VALUES (?, ?, 'fotosintesis', 0.98, ?)
`).run(crypto.randomUUID(), conceptId, now);

db.prepare(`
  INSERT OR IGNORE INTO concept_aliases (
    id,
    concept_id,
    alias,
    confidence_score,
    created_at
  )
  VALUES (?, ?, 'fotosíntesis', 0.98, ?)
`).run(crypto.randomUUID(), conceptId, now);

const evidenceId = crypto.randomUUID();

db.prepare(`
  INSERT INTO evidence (
    id,
    source_type,
    source_name,
    source_url,
    content_summary,
    reliability_score,
    captured_at
  )
  VALUES (?, 'SEED_CORE_KNOWLEDGE', 'ALAI Core Biology Seed', NULL, ?, 0.86, ?)
`).run(
  evidenceId,
  "Photosynthesis uses light energy, carbon dioxide, and water to produce glucose and oxygen in plants, algae, and some bacteria.",
  now
);

db.prepare(`
  INSERT OR IGNORE INTO concept_evidence_links (
    evidence_id,
    concept_id,
    confidence_score,
    created_at
  )
  VALUES (?, ?, 0.9, ?)
`).run(evidenceId, conceptId, now);

db.prepare(`
  INSERT OR REPLACE INTO concept_mastery (
    concept_id,
    mastery_score,
    mastery_level,
    updated_at
  )
  VALUES (?, 0.82, 'STRONG', ?)
`).run(conceptId, now);

db.prepare(`
  DELETE FROM alai_research_questions
  WHERE question LIKE '%Three-dimensional Space%'
    AND status = 'OPEN'
`).run();

console.log("Seeded Photosynthesis core concept:", conceptId);

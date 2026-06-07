import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

function evidenceCount(raw: string) {
  try {
    const ids = JSON.parse(raw);
    return Array.isArray(ids) ? ids.length : 0;
  } catch {
    return 0;
  }
}

const candidates = db.prepare(`
  SELECT
    id,
    name,
    description,
    curriculum_topic_id,
    source_evidence_ids_json,
    quality_score
  FROM candidate_concepts
  WHERE status = 'PENDING'
    AND quality_score >= 0.7
    AND curriculum_topic_id IS NOT NULL
`).all() as {
  id: string;
  name: string;
  description: string;
  curriculum_topic_id: string;
  source_evidence_ids_json: string;
  quality_score: number;
}[];

let promoted = 0;
let skipped = 0;
let evidenceInserted = 0;
let linksInserted = 0;

for (const c of candidates) {
  const ids = JSON.parse(c.source_evidence_ids_json) as string[];

  if (evidenceCount(c.source_evidence_ids_json) < 3) {
    db.prepare(`
      UPDATE candidate_concepts
      SET status = 'REJECTED',
          rejection_reason = 'Rejected by promotion gate: needs at least 3 evidence items.',
          updated_at = ?
      WHERE id = ?
    `).run(now, c.id);

    skipped++;
    continue;
  }

  const existingConcept = db.prepare(`
    SELECT id
    FROM concepts
    WHERE lower(name) = lower(?)
    LIMIT 1
  `).get(c.name) as { id: string } | undefined;

  const conceptId = existingConcept?.id ?? crypto.randomUUID();

  if (!existingConcept) {
    db.prepare(`
      INSERT INTO concepts (
        id,
        name,
        description,
        status,
        confidence_score,
        uncertainty_score,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      conceptId,
      c.name,
      c.description,
      "PENDING",
      0.45,
      0.55,
      now,
      now
    );

    promoted++;
  }

  db.prepare(`
    INSERT OR IGNORE INTO topic_concepts (
      topic_id,
      concept_id,
      confidence_score,
      created_at
    ) VALUES (?, ?, ?, ?)
  `).run(c.curriculum_topic_id, conceptId, c.quality_score, now);

  for (const candidateEvidenceId of ids) {
    const ce = db.prepare(`
      SELECT
        source_type,
        source_name,
        source_url,
        content_summary,
        reliability_score
      FROM candidate_evidence
      WHERE id = ?
        AND status = 'PENDING'
      LIMIT 1
    `).get(candidateEvidenceId) as {
      source_type: string;
      source_name: string;
      source_url: string | null;
      content_summary: string;
      reliability_score: number;
    } | undefined;

    if (!ce) continue;

    const existingEvidence = db.prepare(`
      SELECT id
      FROM evidence
      WHERE COALESCE(source_url, '') = COALESCE(?, '')
        AND content_summary = ?
      LIMIT 1
    `).get(ce.source_url, ce.content_summary) as { id: string } | undefined;

    const evidenceId = existingEvidence?.id ?? crypto.randomUUID();

    if (!existingEvidence) {
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
        evidenceId,
        ce.source_type,
        ce.source_name,
        ce.source_url,
        ce.content_summary,
        ce.reliability_score,
        now
      );

      evidenceInserted++;
    }

    db.prepare(`
      INSERT OR IGNORE INTO concept_evidence_links (
        evidence_id,
        concept_id,
        confidence_score,
        created_at
      ) VALUES (?, ?, ?, ?)
    `).run(evidenceId, conceptId, 0.65, now);

    linksInserted++;
  }

  db.prepare(`
    INSERT INTO concept_mastery (
      id,
      concept_id,
      mastery_score,
      evidence_count,
      relation_count,
      contradiction_count,
      last_calculated_at,
      created_at,
      updated_at
    ) VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(concept_id) DO UPDATE SET
      mastery_score = excluded.mastery_score,
      evidence_count = excluded.evidence_count,
      relation_count = excluded.relation_count,
      last_calculated_at = excluded.last_calculated_at,
      updated_at = excluded.updated_at
  `).run(
    conceptId,
    0.25,
    ids.length,
    0,
    0,
    now,
    now,
    now
  );

  db.prepare(`
    UPDATE candidate_concepts
    SET status = 'PROMOTED',
        updated_at = ?
    WHERE id = ?
  `).run(now, c.id);
}

console.log("ALAI Genesis candidate promotion completed.");
console.log({
  candidatesChecked: candidates.length,
  promoted,
  skipped,
  evidenceInserted,
  linksInserted,
});

console.table(db.prepare(`
  SELECT
    c.name,
    c.status,
    cm.mastery_score AS mastery,
    cm.evidence_count AS evidence
  FROM concepts c
  LEFT JOIN concept_mastery cm ON cm.concept_id = c.id
  ORDER BY c.created_at DESC
  LIMIT 20
`).all());

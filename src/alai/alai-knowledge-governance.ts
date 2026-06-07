import Database from "better-sqlite3";
import { buildCanonicalDefinition } from "./alai-canonical-definition-builder";
import { buildCanonicalExample } from "./alai-canonical-example-builder";
import { generateCanonicalPack } from "./alai-canonical-pack-generator";

export type GovernanceResult = {
  conceptId: string;
  conceptName: string;
  evidenceCount: number;
  relationCount: number;
  confidenceScore: number;
  masteryScore: number;
  masteryLevel: "WEAK" | "DEVELOPING" | "STRONG" | "MASTERED";
  nextStatus: "PENDING" | "VERIFIED" | "CANONICAL";
};

function masteryLevel(score: number): GovernanceResult["masteryLevel"] {
  if (score >= 0.82) return "MASTERED";
  if (score >= 0.68) return "STRONG";
  if (score >= 0.5) return "DEVELOPING";
  return "WEAK";
}

export function recalculateConceptGovernance(
  db: Database.Database,
  conceptId: string
): GovernanceResult | null {
  const concept = db.prepare(`
    SELECT id, name, status, confidence_score AS confidenceScore
    FROM concepts
    WHERE id = ?
    LIMIT 1
  `).get(conceptId) as
    | { id: string; name: string; status: string; confidenceScore: number }
    | undefined;

  if (!concept) return null;

  const evidence = db.prepare(`
    SELECT COUNT(*) AS count
    FROM concept_evidence_links
    WHERE concept_id = ?
  `).get(conceptId) as { count: number };

  const relations = db.prepare(`
    SELECT COUNT(*) AS count
    FROM relations
    WHERE from_concept_id = ?
       OR to_concept_id = ?
  `).get(conceptId, conceptId) as { count: number };

  const evidenceScore = Math.min(evidence.count / 4, 1);
  const relationScore = Math.min(relations.count / 4, 1);
  const confidenceScore = Math.max(0, Math.min(concept.confidenceScore || 0, 1));

  const masteryScore = Number((
    evidenceScore * 0.42 +
    relationScore * 0.33 +
    confidenceScore * 0.25
  ).toFixed(3));

  const level = masteryLevel(masteryScore);

  const nextStatus =
    concept.status === "CANONICAL"
      ? "CANONICAL"
      : masteryScore >= 0.68 && evidence.count >= 2
        ? "VERIFIED"
        : "PENDING";

  const nextConfidence = Math.max(confidenceScore, masteryScore);

  const now = new Date().toISOString();

  db.exec(`
    CREATE TABLE IF NOT EXISTS canonical_examples (
      id TEXT PRIMARY KEY,
      concept_id TEXT NOT NULL,
      example_text TEXT NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'ALAI_CANONICAL',
      confidence_score REAL NOT NULL DEFAULT 0.7,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(concept_id, example_text)
    );
  `);

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
      updated_at,
      mastery_level,
      evidence_score,
      relation_score,
      capability_score,
      last_evaluated_at
    )
    VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, 0, ?)
    ON CONFLICT(concept_id) DO UPDATE SET
      mastery_score = excluded.mastery_score,
      evidence_count = excluded.evidence_count,
      relation_count = excluded.relation_count,
      last_calculated_at = excluded.last_calculated_at,
      updated_at = excluded.updated_at,
      mastery_level = excluded.mastery_level,
      evidence_score = excluded.evidence_score,
      relation_score = excluded.relation_score,
      last_evaluated_at = excluded.last_evaluated_at
  `).run(
    conceptId,
    masteryScore,
    evidence.count,
    relations.count,
    now,
    now,
    now,
    level,
    Number(evidenceScore.toFixed(3)),
    Number(relationScore.toFixed(3)),
    now
  );

  const evidenceRows = db.prepare(`
    SELECT e.content_summary AS summary
    FROM evidence e
    JOIN concept_evidence_links cel ON cel.evidence_id = e.id
    WHERE cel.concept_id = ?
    ORDER BY e.reliability_score DESC, e.captured_at DESC
    LIMIT 8
  `).all(conceptId) as { summary: string }[];

  const relationRows = db.prepare(`
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

  const canonicalDefinition =
    nextStatus === "VERIFIED" || nextStatus === "CANONICAL"
      ? buildCanonicalDefinition({
          conceptName: concept.name,
          evidence: evidenceRows.map((row) => ({ summary: row.summary })),
          relations: relationRows.map((row) => ({
            from: row.fromConcept,
            type: row.relationType,
            to: row.toConcept,
          })),
        })
      : null;

  const finalDescription = canonicalDefinition || undefined;

  if (finalDescription) {
    db.prepare(`
      UPDATE concepts
      SET status = ?,
          confidence_score = ?,
          description = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      nextStatus,
      Number(nextConfidence.toFixed(3)),
      finalDescription,
      now,
      conceptId
    );
  } else {
    db.prepare(`
      UPDATE concepts
      SET status = ?,
          confidence_score = ?,
          updated_at = ?
      WHERE id = ?
    `).run(nextStatus, Number(nextConfidence.toFixed(3)), now, conceptId);
  }

  if (nextStatus === "VERIFIED" || nextStatus === "CANONICAL") {
    const canonicalExample = buildCanonicalExample({
      conceptName: concept.name,
      description: finalDescription || concept.name,
    });

    if (canonicalExample) {
      db.prepare(`
        INSERT OR IGNORE INTO canonical_examples (
          id,
          concept_id,
          example_text,
          source_type,
          confidence_score,
          created_at,
          updated_at
        )
        VALUES (lower(hex(randomblob(16))), ?, ?, 'ALAI_CANONICAL', ?, ?, ?)
      `).run(conceptId, canonicalExample, Math.max(0.7, masteryScore), now, now);
    }

    generateCanonicalPack(db, conceptId);
  }

  return {
    conceptId,
    conceptName: concept.name,
    evidenceCount: evidence.count,
    relationCount: relations.count,
    confidenceScore: Number(nextConfidence.toFixed(3)),
    masteryScore,
    masteryLevel: level,
    nextStatus,
  };
}

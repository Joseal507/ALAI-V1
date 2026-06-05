import Database from "better-sqlite3";
import {
  calculateKnowledgeConfidence,
  type KnowledgeConfidenceResult,
} from "./knowledge-confidence-engine";

export interface KnowledgeConfidenceFromDbResult extends KnowledgeConfidenceResult {
  matchedConceptNames: string[];
}

export function calculateKnowledgeConfidenceFromDb(
  db: Database.Database,
  question: string
): KnowledgeConfidenceFromDbResult {
  const matchedConceptRows = db.prepare(`
    SELECT DISTINCT concepts.id, concepts.name
    FROM concepts
    LEFT JOIN concept_aliases ON concept_aliases.concept_id = concepts.id
    WHERE lower(?) LIKE '%' || lower(concepts.name) || '%'
       OR (
         concept_aliases.alias IS NOT NULL
         AND lower(?) LIKE '%' || lower(concept_aliases.alias) || '%'
       )
  `).all(question, question) as { id: string; name: string }[];

  const conceptIds = matchedConceptRows.map((row) => row.id);

  let evidenceCount = 0;
  let openGapCount = 0;
  let capabilityCount = 0;

  if (conceptIds.length > 0) {
    const placeholders = conceptIds.map(() => "?").join(",");

    const evidenceRow = db.prepare(`
      SELECT COUNT(DISTINCT evidence_id) AS count
      FROM concept_evidence
      WHERE concept_id IN (${placeholders})
    `).get(...conceptIds) as { count: number };

    evidenceCount = evidenceRow.count;

    const gapRow = db.prepare(`
      SELECT COUNT(*) AS count
      FROM knowledge_gaps
      WHERE status = 'OPEN'
      AND concept_id IN (${placeholders})
    `).get(...conceptIds) as { count: number };

    openGapCount = gapRow.count;

    const capabilityRow = db.prepare(`
      SELECT COUNT(*) AS count
      FROM capabilities
      WHERE concept_id IN (${placeholders})
    `).get(...conceptIds) as { count: number };

    capabilityCount = capabilityRow.count;
  }

  const result = calculateKnowledgeConfidence({
    concepts: matchedConceptRows.length,
    evidence: evidenceCount,
    openGaps: openGapCount,
    capabilities: capabilityCount,
  });

  return {
    matchedConceptNames: matchedConceptRows.map((row) => row.name),
    ...result,
  };
}

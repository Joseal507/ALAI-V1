import Database from "better-sqlite3";
import {
  calculateKnowledgeConfidence,
  type KnowledgeConfidenceResult,
} from "./knowledge-confidence-engine";
import { normalizeQuestionToConceptCandidate } from "./question-concept-normalizer";

export interface KnowledgeConfidenceFromDbResult extends KnowledgeConfidenceResult {
  matchedConceptNames: string[];
  matchMode: "ALIAS_EXACT" | "CONCEPT_EXACT" | "PARTIAL" | "NONE";
}

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function calculateKnowledgeConfidenceFromDb(
  db: Database.Database,
  question: string
): KnowledgeConfidenceFromDbResult {
  const conceptCandidate = normalizeQuestionToConceptCandidate(question);
  const normalizedQuestion = normalize(conceptCandidate);

  let matchMode: KnowledgeConfidenceFromDbResult["matchMode"] = "NONE";

  let matchedConceptRows = db.prepare(`
    SELECT DISTINCT concepts.id, concepts.name
    FROM concept_aliases
    JOIN concepts ON concepts.id = concept_aliases.concept_id
    WHERE lower(concept_aliases.alias) = lower(?)
  `).all(normalizedQuestion) as { id: string; name: string }[];

  if (matchedConceptRows.length > 0) {
    matchMode = "ALIAS_EXACT";
  }

  if (matchedConceptRows.length === 0) {
    matchedConceptRows = db.prepare(`
      SELECT DISTINCT id, name
      FROM concepts
      WHERE lower(name) = lower(?)
    `).all(normalizedQuestion) as { id: string; name: string }[];

    if (matchedConceptRows.length > 0) {
      matchMode = "CONCEPT_EXACT";
    }
  }

  if (matchedConceptRows.length === 0) {
    matchedConceptRows = db.prepare(`
      SELECT DISTINCT concepts.id, concepts.name
      FROM concepts
      LEFT JOIN concept_aliases ON concept_aliases.concept_id = concepts.id
      WHERE lower(?) LIKE '%' || lower(concepts.name) || '%'
         OR (
           concept_aliases.alias IS NOT NULL
           AND lower(?) LIKE '%' || lower(concept_aliases.alias) || '%'
         )
      ORDER BY length(concepts.name) DESC
      LIMIT 4
    `).all(question, question) as { id: string; name: string }[];

    if (matchedConceptRows.length > 0) {
      matchMode = "PARTIAL";
    }
  }

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
    matchMode,
    ...result,
  };
}

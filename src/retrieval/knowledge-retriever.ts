import Database from "better-sqlite3";

export interface RetrievedConcept {
  id: string;
  name: string;
  description: string;
  confidenceScore: number;
  uncertaintyScore: number;
}

export interface RetrievedCapability {
  conceptName: string;
  capabilityType: string;
  description: string;
  masteryScore: number;
}

export interface RetrievedEvidence {
  conceptName: string;
  sourceType: string;
  sourceName: string;
  sourceUrl: string | null;
  contentSummary: string;
  reliabilityScore: number;
}

export interface RetrievedKnowledgeContext {
  concepts: RetrievedConcept[];
  capabilities: RetrievedCapability[];
  evidence: RetrievedEvidence[];
}

export function retrieveKnowledgeForQuestion(
  db: Database.Database,
  question: string
): RetrievedKnowledgeContext {
  const concepts = db.prepare(`
    SELECT DISTINCT
      concepts.id,
      concepts.name,
      concepts.description,
      concepts.confidence_score AS confidenceScore,
      concepts.uncertainty_score AS uncertaintyScore
    FROM concepts
    LEFT JOIN concept_aliases ON concept_aliases.concept_id = concepts.id
    WHERE lower(?) LIKE '%' || lower(concepts.name) || '%'
       OR (
         concept_aliases.alias IS NOT NULL
         AND lower(?) LIKE '%' || lower(concept_aliases.alias) || '%'
       )
    ORDER BY concepts.confidence_score DESC
    LIMIT 8
  `).all(question, question) as RetrievedConcept[];

  const conceptIds = concepts.map((concept) => concept.id);

  if (conceptIds.length === 0) {
    return {
      concepts: [],
      capabilities: [],
      evidence: [],
    };
  }

  const placeholders = conceptIds.map(() => "?").join(",");

  const capabilities = db.prepare(`
    SELECT
      concepts.name AS conceptName,
      capabilities.capability_type AS capabilityType,
      capabilities.description,
      capabilities.mastery_score AS masteryScore
    FROM capabilities
    JOIN concepts ON concepts.id = capabilities.concept_id
    WHERE capabilities.concept_id IN (${placeholders})
    ORDER BY capabilities.mastery_score DESC
    LIMIT 12
  `).all(...conceptIds) as RetrievedCapability[];

  const evidence = db.prepare(`
    SELECT
      concepts.name AS conceptName,
      evidence.source_type AS sourceType,
      evidence.source_name AS sourceName,
      evidence.source_url AS sourceUrl,
      evidence.content_summary AS contentSummary,
      evidence.reliability_score AS reliabilityScore
    FROM concept_evidence
    JOIN concepts ON concepts.id = concept_evidence.concept_id
    JOIN evidence ON evidence.id = concept_evidence.evidence_id
    WHERE concept_evidence.concept_id IN (${placeholders})
    ORDER BY evidence.reliability_score DESC, evidence.captured_at DESC
    LIMIT 12
  `).all(...conceptIds) as RetrievedEvidence[];

  return {
    concepts,
    capabilities,
    evidence,
  };
}

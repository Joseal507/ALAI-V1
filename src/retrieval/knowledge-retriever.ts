import Database from "better-sqlite3";

export interface RetrievedConcept {
  id: string;
  name: string;
  description: string;
  confidenceScore: number;
  uncertaintyScore: number;
  matchScore: number;
  matchReason: string;
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

export interface RetrievedRelation {
  fromConceptName: string;
  toConceptName: string;
  relationType: string;
  description: string;
  confidenceScore: number;
}

export interface RetrievedKnowledgeContext {
  concepts: RetrievedConcept[];
  capabilities: RetrievedCapability[];
  evidence: RetrievedEvidence[];
  relations: RetrievedRelation[];
}

type ConceptCandidate = {
  id: string;
  name: string;
  description: string;
  confidenceScore: number;
  uncertaintyScore: number;
  aliases: string | null;
};

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "does",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "the",
  "to",
  "what",
  "when",
  "where",
  "which",
  "why",
  "with",
]);

const DOMAIN_SYNONYMS: Record<string, string[]> = {
  torque: ["rotational force", "moment of force", "turning force"],
  "angular momentum": ["moment of momentum", "rotational momentum"],
  "angular frequency": ["omega", "ω", "angular speed"],
  "ordinary frequency": ["frequency", "nu", "ν", "cycles per second"],
  photosynthesis: ["plant energy conversion", "light energy conversion"],
  force: ["push", "pull"],
};

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\sωθντ]/gu, " ")
    .replace(/\s+/g, " ");
}

function tokenize(value: string): string[] {
  return normalize(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

function includesPhrase(haystack: string, phrase: string): boolean {
  return normalize(haystack).includes(normalize(phrase));
}

function scoreConcept(
  question: string,
  candidate: ConceptCandidate
): { score: number; reason: string } {
  const normalizedQuestion = normalize(question);
  const name = normalize(candidate.name);
  const aliases = (candidate.aliases || "")
    .split("||")
    .map((alias) => alias.trim())
    .filter(Boolean);

  let score = 0;
  const reasons: string[] = [];

  if (normalizedQuestion.includes(name)) {
    score += 1.0;
    reasons.push("exact concept phrase");
  }

  for (const alias of aliases) {
    if (includesPhrase(question, alias)) {
      score += 0.85;
      reasons.push(`alias match: ${alias}`);
    }
  }

  const synonyms = DOMAIN_SYNONYMS[name] || [];
  for (const synonym of synonyms) {
    if (includesPhrase(question, synonym)) {
      score += 0.75;
      reasons.push(`domain synonym: ${synonym}`);
    }
  }

  const questionTokens = new Set(tokenize(question));
  const nameTokens = tokenize(candidate.name);
  const descriptionTokens = tokenize(candidate.description);

  const nameMatches = nameTokens.filter((token) => questionTokens.has(token));
  const descriptionMatches = descriptionTokens
    .filter((token) => questionTokens.has(token))
    .slice(0, 5);

  if (nameMatches.length > 0) {
    score += (nameMatches.length / Math.max(nameTokens.length, 1)) * 0.65;
    reasons.push(`name token overlap: ${nameMatches.join(", ")}`);
  }

  if (descriptionMatches.length > 0) {
    score += Math.min(descriptionMatches.length * 0.08, 0.32);
    reasons.push(`description overlap: ${descriptionMatches.join(", ")}`);
  }

  score += Math.min(candidate.confidenceScore * 0.15, 0.15);

  return {
    score,
    reason: reasons.length > 0 ? reasons.join("; ") : "low semantic overlap",
  };
}

function retrieveConcepts(
  db: Database.Database,
  question: string
): RetrievedConcept[] {
  const candidates = db.prepare(`
    SELECT
      concepts.id,
      concepts.name,
      concepts.description,
      concepts.confidence_score AS confidenceScore,
      concepts.uncertainty_score AS uncertaintyScore,
      GROUP_CONCAT(concept_aliases.alias, '||') AS aliases
    FROM concepts
    LEFT JOIN concept_aliases ON concept_aliases.concept_id = concepts.id
    GROUP BY concepts.id
  `).all() as ConceptCandidate[];

  return candidates
    .map((candidate) => {
      const match = scoreConcept(question, candidate);

      return {
        id: candidate.id,
        name: candidate.name,
        description: candidate.description,
        confidenceScore: candidate.confidenceScore,
        uncertaintyScore: candidate.uncertaintyScore,
        matchScore: Number(match.score.toFixed(4)),
        matchReason: match.reason,
      };
    })
    .filter((concept) => concept.matchScore >= 0.28)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 8);
}

export function retrieveKnowledgeForQuestion(
  db: Database.Database,
  question: string
): RetrievedKnowledgeContext {
  const concepts = retrieveConcepts(db, question);
  const conceptIds = concepts.map((concept) => concept.id);

  if (conceptIds.length === 0) {
    return {
      concepts: [],
      capabilities: [],
      evidence: [],
      relations: [],
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

  const relations = db.prepare(`
    SELECT
      source.name AS fromConceptName,
      target.name AS toConceptName,
      relations.relation_type AS relationType,
      relations.description,
      relations.confidence_score AS confidenceScore
    FROM relations
    JOIN concepts AS source ON source.id = relations.from_concept_id
    JOIN concepts AS target ON target.id = relations.to_concept_id
    WHERE relations.from_concept_id IN (${placeholders})
       OR relations.to_concept_id IN (${placeholders})
    ORDER BY relations.confidence_score DESC
    LIMIT 20
  `).all(...conceptIds, ...conceptIds) as RetrievedRelation[];

  return {
    concepts,
    capabilities,
    evidence,
    relations,
  };
}

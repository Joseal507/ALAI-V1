export interface KnowledgeConfidenceResult {
  confidence: number;
  shouldResearch: boolean;
  matchedConcepts: number;
  matchedEvidence: number;
  matchedOpenGaps: number;
  matchedCapabilities: number;
  matchedRelations: number;
  matchedVerifiedConcepts: number;
  reasoning: string;
}

export function calculateKnowledgeConfidence(params: {
  concepts: number;
  evidence: number;
  openGaps: number;
  capabilities: number;
  relations?: number;
  verifiedConcepts?: number;
}): KnowledgeConfidenceResult {
  const relations = params.relations ?? 0;
  const verifiedConcepts = params.verifiedConcepts ?? 0;

  let score = 0;

  score += Math.min(params.concepts * 0.12, 0.3);
  score += Math.min(verifiedConcepts * 0.12, 0.3);
  score += Math.min(relations * 0.06, 0.3);
  score += Math.min(params.evidence * 0.06, 0.18);
  score += Math.min(params.capabilities * 0.08, 0.18);
  score -= Math.min(params.openGaps * 0.15, 0.5);

  if (params.concepts >= 2 && relations >= 1) {
    score += 0.12;
  }

  if (verifiedConcepts >= 2 && relations >= 1) {
    score += 0.12;
  }

  score = Math.max(0, Math.min(1, score));

  return {
    confidence: Number(score.toFixed(3)),
    shouldResearch: score < 0.65,
    matchedConcepts: params.concepts,
    matchedEvidence: params.evidence,
    matchedOpenGaps: params.openGaps,
    matchedCapabilities: params.capabilities,
    matchedRelations: relations,
    matchedVerifiedConcepts: verifiedConcepts,
    reasoning:
      score < 0.65
        ? "Knowledge confidence below threshold."
        : "Knowledge confidence sufficient.",
  };
}

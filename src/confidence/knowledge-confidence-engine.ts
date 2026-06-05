export interface KnowledgeConfidenceResult {
  confidence: number;
  shouldResearch: boolean;
  matchedConcepts: number;
  matchedEvidence: number;
  matchedOpenGaps: number;
  matchedCapabilities: number;
  reasoning: string;
}

export function calculateKnowledgeConfidence(params: {
  concepts: number;
  evidence: number;
  openGaps: number;
  capabilities: number;
}): KnowledgeConfidenceResult {
  let score = 0;

  score += Math.min(params.concepts * 0.15, 0.35);
  score += Math.min(params.evidence * 0.08, 0.3);
  score += Math.min(params.capabilities * 0.12, 0.3);
  score -= Math.min(params.openGaps * 0.15, 0.5);

  score = Math.max(0, Math.min(1, score));

  return {
    confidence: score,
    shouldResearch: score < 0.65,
    matchedConcepts: params.concepts,
    matchedEvidence: params.evidence,
    matchedOpenGaps: params.openGaps,
    matchedCapabilities: params.capabilities,
    reasoning:
      score < 0.65
        ? "Knowledge confidence below threshold."
        : "Knowledge confidence sufficient.",
  };
}

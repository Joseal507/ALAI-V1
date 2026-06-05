export interface PromotionInput {
  conceptName: string;
  status: string;
  evidenceCount: number;
  relationCount: number;
  capabilityCount: number;
  confidenceScore: number;
}

export interface PromotionDecision {
  shouldPromote: boolean;
  nextStatus: "PENDING" | "VERIFIED" | "CANONICAL";
  nextConfidence: number;
  reason: string;
}

export function decideKnowledgePromotion(
  input: PromotionInput
): PromotionDecision {
  const qualityScore =
    Math.min(input.evidenceCount * 0.25, 0.45) +
    Math.min(input.relationCount * 0.15, 0.3) +
    Math.min(input.capabilityCount * 0.2, 0.2) +
    Math.min(input.confidenceScore * 0.2, 0.2);

  if (input.status === "CANONICAL") {
    return {
      shouldPromote: false,
      nextStatus: "CANONICAL",
      nextConfidence: input.confidenceScore,
      reason: "Already canonical.",
    };
  }

  if (input.status === "VERIFIED") {
    return {
      shouldPromote: false,
      nextStatus: "VERIFIED",
      nextConfidence: input.confidenceScore,
      reason: "Already verified.",
    };
  }

  if (qualityScore >= 0.75) {
    return {
      shouldPromote: true,
      nextStatus: "VERIFIED",
      nextConfidence: Math.max(input.confidenceScore, 0.7),
      reason: "Concept has enough evidence, relations, or capabilities to be verified.",
    };
  }

  return {
    shouldPromote: false,
    nextStatus: "PENDING",
    nextConfidence: input.confidenceScore,
    reason: "Concept does not meet promotion threshold yet.",
  };
}

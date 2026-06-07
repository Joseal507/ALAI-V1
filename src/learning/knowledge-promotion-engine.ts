export interface PromotionInput {
  conceptName: string;
  status: string;
  evidenceCount: number;
  externalEvidenceCount: number;
  groundedExamPassed: boolean;
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

  const hasRealEvidence =
    input.externalEvidenceCount >= 2 || input.groundedExamPassed;

  const hasLearningStructure =
    input.relationCount >= 2 &&
    input.capabilityCount >= 2;

  const hasEnoughTotalEvidence =
    input.evidenceCount >= 3;

  if (hasRealEvidence && hasLearningStructure && hasEnoughTotalEvidence) {
    return {
      shouldPromote: true,
      nextStatus: "VERIFIED",
      nextConfidence: Math.max(input.confidenceScore, 0.7),
      reason: "Concept has real external/grounded evidence plus relations and capabilities.",
    };
  }

  return {
    shouldPromote: false,
    nextStatus: "PENDING",
    nextConfidence: input.confidenceScore,
    reason: "Concept needs real external or grounded evidence before verification.",
  };
}

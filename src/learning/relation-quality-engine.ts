export interface RelationQualityInput {
  fromConcept: string;
  toConcept: string;
  relationType: string;
  description: string;
}

export interface RelationQualityDecision {
  accepted: boolean;
  confidence: number;
  reason: string;
}

const GENERIC_CONCEPTS = new Set([
  "physics",
  "science",
  "biology",
  "chemistry",
  "engineering",
  "process",
  "system",
  "thing",
  "object",
  "knowledge",
  "information",
]);

export function evaluateRelationQuality(
  input: RelationQualityInput
): RelationQualityDecision {
  const from = input.fromConcept.trim().toLowerCase();
  const to = input.toConcept.trim().toLowerCase();

  if (!from || !to) {
    return {
      accepted: false,
      confidence: 0.95,
      reason: "Missing concept."
    };
  }

  if (from === to) {
    return {
      accepted: false,
      confidence: 0.95,
      reason: "Self relation."
    };
  }

  if (
    input.relationType === "IS_A" &&
    GENERIC_CONCEPTS.has(to)
  ) {
    return {
      accepted: false,
      confidence: 0.9,
      reason: "Target concept too generic for IS_A."
    };
  }


  if (
    input.relationType === "IS_A" &&
    (
      input.description.toLowerCase().includes("analog") ||
      input.description.toLowerCase().includes("correspondent") ||
      input.description.toLowerCase().includes("also called") ||
      input.description.toLowerCase().includes("also referred to as")
    )
  ) {
    return {
      accepted: false,
      confidence: 0.95,
      reason: "IS_A relation looks like alias or analogy."
    };
  }

  if (input.description.trim().length < 15) {
    return {
      accepted: false,
      confidence: 0.8,
      reason: "Weak description."
    };
  }

  return {
    accepted: true,
    confidence: 0.7,
    reason: "Relation passed quality filters."
  };
}

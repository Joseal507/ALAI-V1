import { classifyKnowledgeTier } from "./knowledge-tier-engine";

export interface ConceptAcceptanceInput {
  name: string;
  description: string;
  existingConceptNames: string[];
}

export interface RelationAcceptanceInput {
  fromConcept: string;
  toConcept: string;
  type: string;
  description: string;
}

export interface AcceptanceDecision {
  accepted: boolean;
  confidence: number;
  reason: string;
}

const TOO_GENERIC_CONCEPTS = new Set([
  "physics",
  "science",
  "biology",
  "chemistry",
  "engineering",
  "force",
  "energy",
  "matter",
  "object",
  "thing",
  "system",
  "process",
  "concept",
  "method",
  "information",
  "knowledge",
]);

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function decideConceptAcceptance(
  input: ConceptAcceptanceInput
): AcceptanceDecision {
  const name = normalize(input.name);
  const description = input.description.trim();

  if (!name || name.length < 3) {
    return {
      accepted: false,
      confidence: 0.95,
      reason: "Concept name is too short or empty.",
    };
  }

  if (TOO_GENERIC_CONCEPTS.has(name)) {
    return {
      accepted: false,
      confidence: 0.9,
      reason: "Concept is too generic to store as a new standalone concept.",
    };
  }

  if (description.length < 20) {
    return {
      accepted: false,
      confidence: 0.85,
      reason: "Concept description is too weak.",
    };
  }

  const tier = classifyKnowledgeTier(input.name, input.description);

  if (tier === "META") {
    return {
      accepted: false,
      confidence: 0.95,
      reason: "Meta concepts require manual promotion and cannot be auto-learned.",
    };
  }

  const duplicate = input.existingConceptNames.some(
    (existingName) => normalize(existingName) === name
  );

  if (duplicate) {
    return {
      accepted: false,
      confidence: 0.9,
      reason: "Concept already exists.",
    };
  }

  return {
    accepted: true,
    confidence: 0.7,
    reason: "Concept is specific enough and not already present.",
  };
}

export function decideRelationAcceptance(
  input: RelationAcceptanceInput
): AcceptanceDecision {
  const from = normalize(input.fromConcept);
  const to = normalize(input.toConcept);
  const description = input.description.trim();

  if (!from || !to || from === to) {
    return {
      accepted: false,
      confidence: 0.95,
      reason: "Invalid relation endpoints.",
    };
  }

  if (TOO_GENERIC_CONCEPTS.has(from) || TOO_GENERIC_CONCEPTS.has(to)) {
    return {
      accepted: false,
      confidence: 0.8,
      reason: "Relation contains overly generic concept.",
    };
  }

  if (description.length < 20) {
    return {
      accepted: false,
      confidence: 0.85,
      reason: "Relation description is too weak.",
    };
  }

  if (input.type === "IS_A") {
    const suspiciousAbstractTargets = new Set([
      "physics",
      "engineering",
      "science",
      "biology",
      "chemistry",
    ]);

    if (suspiciousAbstractTargets.has(to)) {
      return {
        accepted: false,
        confidence: 0.85,
        reason: "IS_A relation points to a broad field instead of a true category.",
      };
    }
  }

  return {
    accepted: true,
    confidence: 0.7,
    reason: "Relation appears specific and useful.",
  };
}

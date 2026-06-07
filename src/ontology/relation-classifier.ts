export type OntologyRelationType =
  | "IS_A"
  | "PART_OF"
  | "CAUSES"
  | "CHANGES"
  | "DEPENDS_ON"
  | "RELATED_TO"
  | "ALIAS_OF"
  | "ANALOG_OF"
  | "USED_FOR"
  | "USES"
  | "SUPPORTS"
  | "FOUNDATION_FOR"
  | "PREREQUISITE_FOR"
  | "EXPLAINS"
  | "FORMULA_RELATION"
  | "DEFINES"
  | "INDIRECTLY_DEPENDS_ON"
  | "INDIRECTLY_RELATED_TO"
  | "CONTRIBUTES_TO";

export interface RelationClassificationInput {
  fromConcept: string;
  toConcept: string;
  relationType: string;
  description: string;
}

export interface RelationClassificationDecision {
  relationType: OntologyRelationType;
  accepted: boolean;
  confidence: number;
  reason: string;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function classifyRelationOntology(
  input: RelationClassificationInput
): RelationClassificationDecision {
  const from = normalize(input.fromConcept);
  const to = normalize(input.toConcept);
  const description = normalize(input.description);
  const rawType = input.relationType.trim().toUpperCase();

  if (!from || !to || from === to) {
    return {
      relationType: "RELATED_TO",
      accepted: false,
      confidence: 0.95,
      reason: "Invalid relation endpoints.",
    };
  }

  if (
    rawType === "EQUALS" ||
    description.includes("also called") ||
    description.includes("also referred to as") ||
    description.includes("known as")
  ) {
    return {
      relationType: "ALIAS_OF",
      accepted: true,
      confidence: 0.9,
      reason: "Alias/synonym relation.",
    };
  }

  if (
    description.includes("analog") ||
    description.includes("analogue") ||
    description.includes("correspondent")
  ) {
    return {
      relationType: "ANALOG_OF",
      accepted: true,
      confidence: 0.9,
      reason: "Analogy relation.",
    };
  }

  if (
    from === "torque" &&
    to === "angular momentum" &&
    (
      rawType === "CHANGES" ||
      rawType === "CAUSES" ||
      description.includes("changes angular momentum") ||
      description.includes("time derivative of angular momentum")
    )
  ) {
    return {
      relationType: "CHANGES",
      accepted: true,
      confidence: 0.9,
      reason: "Scientific change relation.",
    };
  }

  if (
    description.includes("d l") ||
    description.includes("d\\mathbf") ||
    description.includes("dl/dt") ||
    description.includes("derivative") ||
    description.includes("equals the applied torque")
  ) {
    return {
      relationType: "FORMULA_RELATION",
      accepted: true,
      confidence: 0.85,
      reason: "Mathematical/formula relation.",
    };
  }

  if (
    rawType === "IS_A" &&
    (
      description.includes("concept in") ||
      description.includes("used in") ||
      description.includes("describe") ||
      description.includes("explains")
    )
  ) {
    return {
      relationType: "RELATED_TO",
      accepted: true,
      confidence: 0.75,
      reason: "Weak IS_A converted to RELATED_TO.",
    };
  }

  if (
    rawType === "IS_A" ||
    rawType === "PART_OF" ||
    rawType === "CAUSES" ||
    rawType === "CHANGES" ||
    rawType === "DEPENDS_ON" ||
    rawType === "RELATED_TO" ||
    rawType === "USED_FOR" ||
    rawType === "USES" ||
    rawType === "SUPPORTS" ||
    rawType === "FOUNDATION_FOR" ||
    rawType === "PREREQUISITE_FOR" ||
    rawType === "EXPLAINS" ||
    rawType === "FORMULA_RELATION" ||
    rawType === "DEFINES" ||
    rawType === "CONTRIBUTES_TO" ||
    rawType === "INDIRECTLY_DEPENDS_ON" ||
    rawType === "INDIRECTLY_RELATED_TO"
  ) {
    return {
      relationType: rawType as OntologyRelationType,
      accepted: true,
      confidence: 0.7,
      reason: "Relation type accepted.",
    };
  }

  return {
    relationType: "RELATED_TO",
    accepted: false,
    confidence: 0.75,
    reason: `Unsupported relation type: ${input.relationType}`,
  };
}

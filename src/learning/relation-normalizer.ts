import type { ExtractedRelation } from "./relation-extractor";

const SYMBOL_CONCEPT_MAP: Record<string, string> = {
  "ω": "Angular Frequency",
  "omega": "Angular Frequency",
  "ν": "Ordinary frequency",
  "nu": "Ordinary frequency",
  "f": "Ordinary frequency",
  "dθ/dt": "Angular Frequency",
  "dtheta/dt": "Angular Frequency",
  "τ": "Torque",
  "tau": "Torque",
  "l": "Angular Momentum",
};

function clean(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeConcept(value: string): string {
  const cleaned = clean(value);
  const lower = cleaned.toLowerCase();

  if (SYMBOL_CONCEPT_MAP[cleaned]) return SYMBOL_CONCEPT_MAP[cleaned];
  if (SYMBOL_CONCEPT_MAP[lower]) return SYMBOL_CONCEPT_MAP[lower];

  if (lower.includes("derivative of angular momentum")) return "Angular Momentum";
  if (lower.includes("applied torque")) return "Torque";
  if (lower === "moment of momentum") return "Angular Momentum";
  if (lower === "rotational momentum") return "Angular Momentum";
  if (lower === "moment of force") return "Torque";

  return cleaned;
}

function normalizeType(relation: ExtractedRelation): ExtractedRelation["type"] {
  const from = normalizeConcept(relation.fromConcept).toLowerCase();
  const to = normalizeConcept(relation.toConcept).toLowerCase();
  const description = relation.description.toLowerCase();

  if (
    from === "torque" &&
    to === "angular momentum" &&
    (
      description.includes("derivative") ||
      description.includes("changes") ||
      description.includes("equals")
    )
  ) {
    return "CAUSES";
  }

  if (
    from === "angular momentum" &&
    to === "torque" &&
    description.includes("derivative")
  ) {
    return "DEPENDS_ON";
  }

  return relation.type;
}

export function normalizeExtractedRelations(
  relations: ExtractedRelation[]
): ExtractedRelation[] {
  return relations.map((relation) => {
    const normalized = {
      ...relation,
      fromConcept: normalizeConcept(relation.fromConcept),
      toConcept: normalizeConcept(relation.toConcept),
    };

    return {
      ...normalized,
      type: normalizeType(normalized),
    };
  });
}

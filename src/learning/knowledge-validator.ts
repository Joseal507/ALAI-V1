import type { RelationType } from "../types/world-model";
import type { ExtractedConcept } from "./learning-extractor";
import type { ExtractedRelation } from "./relation-extractor";

const VALID_RELATION_TYPES = new Set<string>([
  "IS_A",
  "PART_OF",
  "DEPENDS_ON",
  "CAUSES",
  "PRODUCES",
  "EXPLAINS",
  "CONTRADICTS",
  "SUPPORTS",
  "RELATED_TO",
  "USED_FOR",
  "REQUIRES",
  "LEADS_TO",
]);

const BANNED_CONCEPT_NAMES = new Set<string>([
  "wikipedia",
  "google",
  "youtube",
  "chatgpt",
  "gemini",
  "claude",
  "openai",
  "physics libretexts",
  "nasa",
  "website",
  "source",
  "article",
]);

export interface ValidationResult<T> {
  accepted: T[];
  rejected: {
    item: T;
    reason: string;
  }[];
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function isBadConceptName(name: string): boolean {
  const normalized = normalize(name);

  if (!normalized) return true;
  if (normalized.length < 3) return true;
  if (BANNED_CONCEPT_NAMES.has(normalized)) return true;
  if (/^https?:\/\//.test(normalized)) return true;

  return false;
}

export function validateExtractedConcepts(
  concepts: ExtractedConcept[]
): ValidationResult<ExtractedConcept> {
  const accepted: ExtractedConcept[] = [];
  const rejected: ValidationResult<ExtractedConcept>["rejected"] = [];

  for (const concept of concepts) {
    if (isBadConceptName(concept.name)) {
      rejected.push({ item: concept, reason: "Invalid or banned concept name." });
      continue;
    }

    if (!concept.description || concept.description.trim().length < 12) {
      rejected.push({ item: concept, reason: "Description too short." });
      continue;
    }

    accepted.push({
      ...concept,
      name: concept.name.trim(),
      description: concept.description.trim(),
      aliases: Array.isArray(concept.aliases)
        ? concept.aliases
            .map((alias) => alias.trim())
            .filter((alias) => !isBadConceptName(alias))
        : [],
    });
  }

  return { accepted, rejected };
}

export function validateExtractedRelations(
  relations: ExtractedRelation[]
): ValidationResult<ExtractedRelation> {
  const accepted: ExtractedRelation[] = [];
  const rejected: ValidationResult<ExtractedRelation>["rejected"] = [];

  for (const relation of relations) {
    if (!VALID_RELATION_TYPES.has(String(relation.type))) {
      rejected.push({
        item: relation,
        reason: `Invalid relation type: ${String(relation.type)}`,
      });
      continue;
    }

    if (isBadConceptName(relation.fromConcept)) {
      rejected.push({ item: relation, reason: "Invalid fromConcept." });
      continue;
    }

    if (isBadConceptName(relation.toConcept)) {
      rejected.push({ item: relation, reason: "Invalid toConcept." });
      continue;
    }

    if (!relation.description || relation.description.trim().length < 12) {
      rejected.push({ item: relation, reason: "Relation description too short." });
      continue;
    }

    accepted.push({
      ...relation,
      type: relation.type as RelationType,
      fromConcept: relation.fromConcept.trim(),
      toConcept: relation.toConcept.trim(),
      description: relation.description.trim(),
    });
  }

  return { accepted, rejected };
}

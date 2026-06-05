export type KnowledgeTier =
  | "CORE"
  | "SPECIALIZED"
  | "META";

const META_CONCEPTS = new Set([
  "science",
  "physics",
  "chemistry",
  "biology",
  "engineering",
  "mathematics",
  "knowledge",
  "information",
  "process",
  "system",
  "object",
  "thing",
  "concept",
  "method",
  "discipline",
  "field",
  "area",
  "theory",
]);

export function classifyKnowledgeTier(
  name: string,
  description: string
): KnowledgeTier {
  const normalized = name.trim().toLowerCase();

  if (META_CONCEPTS.has(normalized)) {
    return "META";
  }

  if (
    normalized.includes("photosynthesis") ||
    normalized.includes("momentum") ||
    normalized.includes("torque") ||
    normalized.includes("mitosis") ||
    normalized.includes("gravity")
  ) {
    return "CORE";
  }

  if (description.length > 40) {
    return "SPECIALIZED";
  }

  return "SPECIALIZED";
}

export type ConceptRank = "CORE" | "SUPPORTING" | "NOISE";

const NOISE_CONCEPTS = new Set([
  "physics",
  "engineering",
  "science",
  "biology",
  "chemistry",
  "process",
  "system",
  "object",
  "thing",
  "information",
  "knowledge",
  "full turn",
  "instantaneous angular displacement",
  "biological processes",
  "chemical process",
]);

export function rankConcept(name: string, description: string): ConceptRank {
  const normalized = name.trim().toLowerCase();

  if (!normalized || normalized.length < 3) return "NOISE";

  if (NOISE_CONCEPTS.has(normalized)) return "NOISE";

  if (
    normalized.includes("torque") ||
    normalized.includes("angular momentum") ||
    normalized.includes("photosynthesis") ||
    normalized.includes("euler") ||
    normalized.includes("rigid body") ||
    normalized.includes("rotational motion")
  ) {
    return "CORE";
  }

  if (
    normalized.includes("frequency") ||
    normalized.includes("force") ||
    normalized.includes("rotation") ||
    normalized.includes("momentum")
  ) {
    return "SUPPORTING";
  }

  if (description.toLowerCase().includes("concept discovered during")) {
    return "SUPPORTING";
  }

  return "SUPPORTING";
}

export function shouldAutoLearnConcept(name: string, description: string): boolean {
  return rankConcept(name, description) !== "NOISE";
}

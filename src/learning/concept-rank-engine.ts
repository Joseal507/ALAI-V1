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
    normalized.includes("matrix") ||
    normalized.includes("proof") ||
    normalized.includes("prime factorization") ||
    normalized.includes("fundamental theorem of arithmetic") ||
    normalized.includes("numeracy") ||
    normalized.includes("academic writing") ||
    normalized.includes("reading development") ||
    normalized.includes("writing development") ||
    normalized.includes("machine learning") ||
    normalized.includes("artificial intelligence") ||
    normalized.includes("abstract algebra") ||
    normalized.includes("applied mathematics") ||
    normalized.includes("analysis") ||
    normalized.includes("angle") ||
    normalized.includes("geometric measurement") ||
    normalized.includes("technology") ||
    normalized.includes("mathematics") ||
    normalized.includes("language") ||
    normalized.includes("history") ||
    normalized.includes("science") ||
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
    const usefulTerms = [
      "linear",
      "vector",
      "algebra",
      "geometry",
      "number",
      "reading",
      "writing",
      "education",
      "learning",
      "grammar",
      "phonics",
      "arithmetic",
      "science",
      "measurement",
    ];

    if (!usefulTerms.some((term) => normalized.includes(term))) {
      return "NOISE";
    }

    return "SUPPORTING";
  }

  return "SUPPORTING";
}

export function shouldAutoLearnConcept(name: string, description: string): boolean {
  return rankConcept(name, description) !== "NOISE";
}

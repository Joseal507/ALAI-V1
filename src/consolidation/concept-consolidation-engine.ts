export type ConsolidationAction =
  | "MERGE_CONCEPTS"
  | "ADD_ALIAS"
  | "KEEP_SEPARATE";

export interface ConceptCandidate {
  id: string;
  name: string;
  description: string;
}

export interface ConsolidationSuggestion {
  sourceConcept: ConceptCandidate;
  targetConcept: ConceptCandidate;
  action: ConsolidationAction;
  confidence: number;
  reason: string;
}

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const KNOWN_TRANSLATION_EQUIVALENTS = new Map<string, string>([
  ["fuerza", "force"],
]);

const KNOWN_ALIAS_EQUIVALENTS = new Map<string, string>([
  ["moment of force", "torque"],
  ["moment", "torque"],
]);

export function suggestConceptConsolidation(
  concepts: ConceptCandidate[]
): ConsolidationSuggestion[] {
  const suggestions: ConsolidationSuggestion[] = [];

  for (const source of concepts) {
    for (const target of concepts) {
      if (source.id === target.id) continue;

      const sourceName = normalize(source.name);
      const targetName = normalize(target.name);

      const translatedSource = KNOWN_TRANSLATION_EQUIVALENTS.get(sourceName);
      const aliasTarget = KNOWN_ALIAS_EQUIVALENTS.get(sourceName);

      if (translatedSource && translatedSource === targetName) {
        suggestions.push({
          sourceConcept: source,
          targetConcept: target,
          action: "MERGE_CONCEPTS",
          confidence: 0.9,
          reason: `${source.name} appears to be a translation duplicate of ${target.name}.`,
        });
        continue;
      }

      if (aliasTarget && aliasTarget === targetName) {
        suggestions.push({
          sourceConcept: source,
          targetConcept: target,
          action: "ADD_ALIAS",
          confidence: 0.9,
          reason: `${source.name} appears to be an alias of ${target.name}.`,
        });
        continue;
      }

      if (sourceName === targetName) {
        suggestions.push({
          sourceConcept: source,
          targetConcept: target,
          action: "MERGE_CONCEPTS",
          confidence: 0.95,
          reason: "Exact normalized name match.",
        });
      }
    }
  }

  return dedupeSuggestions(suggestions);
}

function dedupeSuggestions(
  suggestions: ConsolidationSuggestion[]
): ConsolidationSuggestion[] {
  const seen = new Set<string>();
  const result: ConsolidationSuggestion[] = [];

  for (const suggestion of suggestions) {
    const key = [
      suggestion.sourceConcept.id,
      suggestion.targetConcept.id,
      suggestion.action,
    ].join(":");

    if (seen.has(key)) continue;

    seen.add(key);
    result.push(suggestion);
  }

  return result;
}

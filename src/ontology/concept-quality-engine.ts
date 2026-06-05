export interface ConceptQualityDecision {
  accepted: boolean;
  reason: string;
}

const GENERIC_WORDS = new Set([
  "thing",
  "object",
  "process",
  "system",
  "information",
  "knowledge",
  "physics",
  "engineering",
  "science",
  "biology",
  "chemistry",
]);

export function evaluateConceptQuality(concept: string): ConceptQualityDecision {
  const value = concept.trim();

  if (!value) {
    return { accepted: false, reason: "Empty concept" };
  }

  if (value.length < 3) {
    return { accepted: false, reason: "Too short" };
  }

  if (value.split(/\s+/).length > 4) {
    return { accepted: false, reason: "Too many words" };
  }

  const lower = value.toLowerCase();


  if (/^[^a-zA-Z]*[ωθπν⋅=\/]+[^a-zA-Z]*$/.test(value)) {
    return { accepted: false, reason: "Looks like formula symbol" };
  }

  if (lower.includes("derivative of")) {
    return { accepted: false, reason: "Looks like formula phrase" };
  }

  if (GENERIC_WORDS.has(lower)) {
    return { accepted: false, reason: "Generic concept" };
  }

  if (lower.includes(" is ") || lower.includes(" are ")) {
    return { accepted: false, reason: "Looks like sentence" };
  }

  return {
    accepted: true,
    reason: "Passed concept quality filters",
  };
}

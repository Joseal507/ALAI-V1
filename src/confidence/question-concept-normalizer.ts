const LEADING_STOP_PHRASES = [
  "explica",
  "explícame",
  "explain",
  "what is",
  "what are",
  "que es",
  "qué es",
  "cual es",
  "cuál es",
  "dime",
  "tell me",
  "define",
];

export function normalizeQuestionToConceptCandidate(question: string): string {
  let value = question.trim().toLowerCase();

  for (const phrase of LEADING_STOP_PHRASES) {
    if (value.startsWith(phrase + " ")) {
      value = value.slice(phrase.length).trim();
      break;
    }
  }

  return value;
}

export type StrategyMode =
  | "FAST"
  | "THINK"
  | "RESEARCH"
  | "LEARN"
  | "REFUSE";

export interface StrategyDecision {
  mode: StrategyMode;
  confidence: number;
  reasons: string[];
}

const REAL_TIME_PATTERNS = [
  "hoy",
  "ayer",
  "ahora",
  "actual",
  "último",
  "ultima",
  "última",
  "reciente",
  "ganó",
  "gano",
  "precio",
  "noticia",
];

const COMPLEX_PATTERNS = [
  "explica",
  "analiza",
  "compara",
  "relaciona",
  "resuelve",
  "enséñame",
  "ensename",
  "profundo",
  "detallado",
];

export function decideStrategy(input: string): StrategyDecision {
  const normalized = input.toLowerCase().trim();

  if (!normalized) {
    return {
      mode: "REFUSE",
      confidence: 1,
      reasons: ["Empty input"],
    };
  }

  const isRealTime = REAL_TIME_PATTERNS.some((pattern) =>
    normalized.includes(pattern)
  );

  if (isRealTime) {
    return {
      mode: "RESEARCH",
      confidence: 0.9,
      reasons: ["The request may require current or changing information."],
    };
  }

  const isComplex = COMPLEX_PATTERNS.some((pattern) =>
    normalized.includes(pattern)
  );

  if (isComplex) {
    return {
      mode: "THINK",
      confidence: 0.75,
      reasons: ["The request asks for reasoning, explanation, analysis, or depth."],
    };
  }

  if (normalized.length < 40) {
    return {
      mode: "FAST",
      confidence: 0.7,
      reasons: ["The request appears short and likely answerable directly."],
    };
  }

  return {
    mode: "THINK",
    confidence: 0.65,
    reasons: ["Defaulting to deeper reasoning for non-trivial input."],
  };
}

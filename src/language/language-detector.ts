export type DetectedLanguage = "es" | "en" | "mixed" | "unknown";

const SPANISH_SIGNALS = [
  "qué",
  "que",
  "cómo",
  "como",
  "dímelo",
  "explica",
  "explícalo",
  "más",
  "corto",
  "casual",
  "vaina",
  "eso",
  "hazlo",
  "para",
  "conmigo",
];

const ENGLISH_SIGNALS = [
  "what",
  "how",
  "why",
  "explain",
  "short",
  "casual",
  "technical",
  "does",
  "affect",
  "change",
];

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function detectLanguage(text: string): DetectedLanguage {
  const normalized = normalize(text);

  const spanishScore = SPANISH_SIGNALS.filter((word) =>
    normalized.includes(word)
  ).length;

  const englishScore = ENGLISH_SIGNALS.filter((word) =>
    normalized.includes(word)
  ).length;

  if (spanishScore === 0 && englishScore === 0) return "unknown";
  if (spanishScore > 0 && englishScore > 0) return "mixed";
  if (spanishScore > englishScore) return "es";
  if (englishScore > spanishScore) return "en";

  return "mixed";
}

export function preferredOutputLanguage(text: string): "es" | "en" {
  const detected = detectLanguage(text);

  if (detected === "es") return "es";
  if (detected === "en") return "en";

  const normalized = normalize(text);

  const explicitSpanish =
    /(dímelo|explícalo|hazlo|como si fuera yo|más corto|más casual|qué|cómo)/.test(normalized);

  const explicitEnglish =
    /(explain|tell me|make it|shorter|casually|how does|what does|why does)/.test(normalized);

  if (explicitEnglish && !explicitSpanish) return "en";
  if (explicitSpanish && !explicitEnglish) return "es";

  return "es";
}

export type DetectedLanguage =
  | "es"
  | "en"
  | "it"
  | "fr"
  | "pt"
  | "zh"
  | "mixed"
  | "unknown";

const LANGUAGE_SIGNALS: Record<Exclude<DetectedLanguage, "mixed" | "unknown">, string[]> = {
  es: ["qué", "que", "cómo", "como", "dímelo", "explícalo", "más", "corto", "vaina", "hazlo", "conmigo"],
  en: ["what", "how", "why", "explain", "short", "casually", "does", "affect", "change"],
  it: ["cosa", "come", "spiegalo", "spiegami", "breve", "casuale", "perché"],
  fr: ["quoi", "comment", "explique", "court", "simple", "pourquoi"],
  pt: ["como", "explique", "curto", "simples", "por que"],
  zh: ["什么", "怎么", "解释", "简短", "简单"],
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function detectLanguage(text: string): DetectedLanguage {
  const normalized = normalize(text);

  const scores = Object.entries(LANGUAGE_SIGNALS).map(([language, signals]) => ({
    language: language as Exclude<DetectedLanguage, "mixed" | "unknown">,
    score: signals.filter((word) => normalized.includes(word)).length,
  }));

  const matched = scores.filter((item) => item.score > 0).sort((a, b) => b.score - a.score);

  if (matched.length === 0) return "unknown";
  if (matched.length > 1 && matched[0].score === matched[1].score) return "mixed";

  return matched[0].language;
}

export function preferredOutputLanguage(text: string): Exclude<DetectedLanguage, "mixed" | "unknown"> {
  const detected = detectLanguage(text);

  if (detected !== "mixed" && detected !== "unknown") return detected;

  const normalized = normalize(text);

  if (/(explain|tell me|make it|shorter|casually|how does|what does|why does)/.test(normalized)) return "en";
  if (/(dímelo|explícalo|hazlo|más corto|más casual|qué|cómo)/.test(normalized)) return "es";
  if (/(spiegami|spiegalo|come|cosa|breve)/.test(normalized)) return "it";
  if (/(explique|comment|quoi|court)/.test(normalized)) return "fr";
  if (/(简短|解释|什么|怎么)/.test(normalized)) return "zh";

  return "en";
}

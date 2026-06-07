import { normalizeAlaiTopic } from "./alai-topic-normalizer";

export type AlaiIntentV2 =
  | "MATH"
  | "GREETING"
  | "IDENTITY"
  | "DEFINITION"
  | "TECHNICAL_EXPLANATION"
  | "SIMPLE_EXPLANATION"
  | "COMPARISON"
  | "EXAMPLE_REQUEST"
  | "SUMMARY"
  | "KNOWLEDGE"
  | "UNKNOWN";

export type AlaiIntentEngineResult = {
  intent: AlaiIntentV2;
  confidence: number;
  topic?: string;
  directAnswer?: string;
  needsKnowledge: boolean;
  needsResearch: boolean;
  reason: string;
};

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[¿?¡!]/g, "")
    .replace(/\s+/g, " ");
}

function tryMath(input: string): string | null {
  const text = normalize(input)
    .replace(/cuanto es/g, "")
    .replace(/calcula/g, "")
    .replace(/calculate/g, "")
    .replace(/what is/g, "")
    .replace(/x/g, "*")
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .trim();

  if (!/^[0-9+\-*/().\s]+$/.test(text)) return null;

  try {
    const result = Function(`"use strict"; return (${text});`)();

    if (typeof result !== "number" || !Number.isFinite(result)) return null;

    return String(Number.isInteger(result) ? result : Number(result.toFixed(8)));
  } catch {
    return null;
  }
}

function extractTopic(input: string): string | undefined {
  const text = normalize(input);

  let cleaned = text
    .replace(/^que es la /, "")
    .replace(/^que es el /, "")
    .replace(/^que es un /, "")
    .replace(/^que es una /, "")
    .replace(/^que es /, "")
    .replace(/^define la /, "")
    .replace(/^define el /, "")
    .replace(/^define /, "")
    .replace(/^explica la /, "")
    .replace(/^explica el /, "")
    .replace(/^explicame la /, "")
    .replace(/^explicame el /, "")
    .replace(/^explicame /, "")
    .replace(/^dime /, "")
    .replace(/ de una manera mas tecnica$/, "")
    .replace(/ de forma mas tecnica$/, "")
    .replace(/ mas tecnico$/, "")
    .replace(/ mas tecnica$/, "")
    .replace(/ tecnicamente$/, "")
    .replace(/ con ejemplos$/, "")
    .replace(/ ejemplos$/, "")
    .trim();

  cleaned = cleaned
    .replace(/^resume /, "")
    .replace(/^resumen de /, "")
    .replace(/^compara /, "")
    .replace(/^hablame de /, "")
    .replace(/^habla de /, "")
    .replace(/^dame otro ejemplo de /, "")
    .replace(/^dame un ejemplo de /, "")
    .replace(/^dame otro ejemplo$/, "")
    .replace(/^dame un ejemplo$/, "")
    .replace(/^otro ejemplo$/, "")
    .trim();

  if (!cleaned || cleaned.length < 2) return undefined;

  const blocked = new Set([
    "eso",
    "esto",
    "lo",
    "la",
    "el",
    "hazlo",
    "explicalo",
    "explicala",
  ]);

  if (blocked.has(cleaned)) return undefined;

  return normalizeAlaiTopic(cleaned);
}

export function detectAlaiIntent(input: string): AlaiIntentEngineResult {
  const text = normalize(input);

  if (!text) {
    return {
      intent: "UNKNOWN",
      confidence: 0,
      needsKnowledge: false,
      needsResearch: false,
      reason: "EMPTY_INPUT",
    };
  }

  const math = tryMath(text);
  if (math !== null) {
    return {
      intent: "MATH",
      confidence: 0.99,
      directAnswer: math,
      needsKnowledge: false,
      needsResearch: false,
      reason: "ARITHMETIC_EXPRESSION",
    };
  }

  if (["hola", "hey", "hello", "buenas", "buenos dias", "buenas tardes"].includes(text)) {
    return {
      intent: "GREETING",
      confidence: 0.96,
      directAnswer:
        "Hey, soy ALAI. Pregúntame algo y si no lo sé bien, puedo investigar, aprender y responder mejor.",
      needsKnowledge: false,
      needsResearch: false,
      reason: "GREETING_PHRASE",
    };
  }

  if (
    text.includes("quien eres") ||
    text.includes("que eres") ||
    text.includes("who are you")
  ) {
    return {
      intent: "IDENTITY",
      confidence: 0.98,
      directAnswer:
        "Soy ALAI, una IA académica en construcción. Tengo cerebro conversacional, memoria de conocimiento, investigación, aprendizaje, validación y lenguaje.",
      needsKnowledge: false,
      needsResearch: false,
      reason: "IDENTITY_QUESTION",
    };
  }

  const topic = extractTopic(text);

  if (
    text.includes("mas tecnico") ||
    text.includes("mas tecnica") ||
    text.includes("tecnicamente") ||
    text.includes("forma tecnica") ||
    text.includes("manera tecnica")
  ) {
    return {
      intent: "TECHNICAL_EXPLANATION",
      confidence: 0.88,
      topic,
      needsKnowledge: true,
      needsResearch: false,
      reason: "TECHNICAL_EXPLANATION_REQUEST",
    };
  }

  if (
    text.startsWith("que es ") ||
    text.startsWith("define ") ||
    text.includes("definicion de")
  ) {
    return {
      intent: "DEFINITION",
      confidence: 0.9,
      topic,
      needsKnowledge: true,
      needsResearch: false,
      reason: "DEFINITION_REQUEST",
    };
  }

  if (
    text.includes("explica") ||
    text.includes("explicame") ||
    text.includes("como funciona")
  ) {
    return {
      intent: "SIMPLE_EXPLANATION",
      confidence: 0.82,
      topic,
      needsKnowledge: true,
      needsResearch: false,
      reason: "EXPLANATION_REQUEST",
    };
  }

  if (
    text.includes("ejemplo") ||
    text.includes("dame un ejemplo") ||
    text.includes("otro ejemplo")
  ) {
    return {
      intent: "EXAMPLE_REQUEST",
      confidence: 0.82,
      topic,
      needsKnowledge: true,
      needsResearch: false,
      reason: "EXAMPLE_REQUEST",
    };
  }

  if (
    text.includes("resume") ||
    text.includes("resumen") ||
    text.includes("resumelo")
  ) {
    return {
      intent: "SUMMARY",
      confidence: 0.82,
      topic,
      needsKnowledge: true,
      needsResearch: false,
      reason: "SUMMARY_REQUEST",
    };
  }

  if (
    text.includes("diferencia") ||
    text.includes("compara") ||
    text.includes("relacion entre")
  ) {
    return {
      intent: "COMPARISON",
      confidence: 0.8,
      topic,
      needsKnowledge: true,
      needsResearch: false,
      reason: "COMPARISON_REQUEST",
    };
  }

  return {
    intent: "KNOWLEDGE",
    confidence: 0.65,
    topic,
    needsKnowledge: true,
    needsResearch: false,
    reason: "GENERAL_KNOWLEDGE_FALLBACK",
  };
}

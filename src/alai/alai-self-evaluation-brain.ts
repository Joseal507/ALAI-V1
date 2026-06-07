import { planAlaiResponse } from "./alai-reasoning-planner-brain";

export type SelfEvaluationInput = {
  userMessage: string;
  answer: string;
  mode: string;
  confidence: number;
  conceptName?: string;
  sources: string[];
};

export type SelfEvaluationResult = {
  score: number;
  strengths: string[];
  weaknesses: string[];
  missingKnowledge: string[];
  shouldResearch: boolean;
  shouldRewrite: boolean;
  reason: string;
};

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function hasAny(text: string, items: string[]): boolean {
  return items.some((item) => text.includes(item));
}

export function evaluateAlaiResponse(
  input: SelfEvaluationInput
): SelfEvaluationResult {
  const plan = planAlaiResponse(input.userMessage);
  const answer = normalize(input.answer);
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const missingKnowledge: string[] = [];

  let score = 70;

  if (!answer || answer.length < 20) {
    return {
      score: 10,
      strengths: [],
      weaknesses: ["La respuesta está vacía o demasiado corta."],
      missingKnowledge: ["Falta una respuesta útil."],
      shouldResearch: true,
      shouldRewrite: true,
      reason: "EMPTY_OR_TOO_SHORT",
    };
  }

  if (input.conceptName && answer.includes(normalize(input.conceptName))) {
    strengths.push("La respuesta mantiene el concepto principal.");
    score += 5;
  }

  if (plan.needs.includes("example")) {
    if (hasAny(answer, ["ejemplo", "por ejemplo", "si una", "si un"])) {
      strengths.push("Incluye un ejemplo cuando el usuario lo pidió.");
      score += 8;
    } else {
      weaknesses.push("El usuario pidió un ejemplo, pero la respuesta no dio uno claro.");
      missingKnowledge.push("Falta un ejemplo canónico o contextual.");
      score -= 18;
    }
  }

  if (plan.needs.includes("summary")) {
    if (answer.startsWith("en resumen") || answer.length < 260) {
      strengths.push("La respuesta está resumida.");
      score += 7;
    } else {
      weaknesses.push("El usuario pidió resumen, pero la respuesta fue larga.");
      score -= 12;
    }
  }

  if (plan.needs.includes("technical_depth")) {
    if (hasAny(answer, ["tecnicamente", "técnicamente", "algebra", "estructura", "operacion", "operación", "elemento"])) {
      strengths.push("Incluye lenguaje técnico cuando el usuario lo pidió.");
      score += 8;
    } else {
      weaknesses.push("El usuario pidió una explicación técnica, pero faltó profundidad.");
      missingKnowledge.push("Falta explicación técnica más fuerte.");
      score -= 16;
    }
  }

  if (plan.needs.includes("uses")) {
    if (hasAny(answer, ["se usa", "sirve", "aplic", "utiliza", "representar"])) {
      strengths.push("Responde sobre usos o aplicaciones.");
      score += 8;
    } else {
      weaknesses.push("El usuario preguntó para qué sirve, pero la respuesta no explicó usos.");
      missingKnowledge.push("Faltan usos/aplicaciones verificados.");
      score -= 18;
    }
  }

  if (plan.needs.includes("misconceptions")) {
    if (hasAny(answer, ["error comun", "error común", "confusion", "confusión", "malentendido"])) {
      strengths.push("Menciona una confusión o error común.");
      score += 8;
    } else {
      weaknesses.push("El usuario pidió errores comunes, pero no se mencionaron.");
      missingKnowledge.push("Faltan errores comunes del concepto.");
      score -= 18;
    }
  }

  if (
    answer.includes("todavia no tengo evidencia suficiente") ||
    answer.includes("todavía no tengo evidencia suficiente") ||
    answer.includes("necesito mas evidencia") ||
    answer.includes("necesito más evidencia")
  ) {
    if (input.confidence < 0.45) {
      strengths.push("Reconoce baja evidencia cuando la confianza es baja.");
      score += 4;
    } else {
      weaknesses.push("La respuesta dice que falta evidencia aunque la confianza no parece tan baja.");
      score -= 10;
    }
  }

  if (answer.includes("undefined") || answer.includes("null") || answer.includes("[object object]")) {
    weaknesses.push("La respuesta contiene artefactos técnicos.");
    score -= 30;
  }

  if (answer.includes("modo:") || answer.includes("trace:") || answer.includes("confidence:")) {
    weaknesses.push("La respuesta filtró detalles internos al usuario.");
    score -= 20;
  }

  if (input.confidence < 0.35) {
    missingKnowledge.push("La confianza interna es baja.");
    score -= 10;
  }

  const repeatedSentences = answer
    .split(".")
    .map((part) => part.trim())
    .filter((part) => part.length > 30);

  const uniqueSentences = new Set(repeatedSentences);

  if (repeatedSentences.length >= 3 && uniqueSentences.size < repeatedSentences.length) {
    weaknesses.push("La respuesta repite información.");
    score -= 10;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const shouldRewrite = score < 72;
  const shouldResearch =
    input.confidence < 0.4 ||
    missingKnowledge.length >= 2 ||
    score < 55;

  return {
    score,
    strengths,
    weaknesses,
    missingKnowledge,
    shouldResearch,
    shouldRewrite,
    reason:
      score >= 85
        ? "GOOD_RESPONSE"
        : score >= 72
          ? "ACCEPTABLE_RESPONSE"
          : "NEEDS_IMPROVEMENT",
  };
}

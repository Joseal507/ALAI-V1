export type UserKnowledgeRequest =
  | "summary"
  | "technical_explanation"
  | "example"
  | "common_misconceptions"
  | "practical_uses"
  | "definition"
  | "general";

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export function analyzeUserKnowledgeRequest(message: string): UserKnowledgeRequest {
  const text = normalize(message);

  if (
    text.includes("error comun") ||
    text.includes("errores comunes") ||
    text.includes("confusion") ||
    text.includes("malentendido") ||
    text.includes("equivocacion")
  ) {
    return "common_misconceptions";
  }

  if (
    text.includes("para que sirve") ||
    text.includes("uso") ||
    text.includes("usos") ||
    text.includes("aplicacion") ||
    text.includes("aplicaciones") ||
    text.includes("donde se usa")
  ) {
    return "practical_uses";
  }

  if (
    text.includes("mas tecnico") ||
    text.includes("mas tecnica") ||
    text.includes("tecnicamente") ||
    text.includes("formal") ||
    text.includes("profundo")
  ) {
    return "technical_explanation";
  }

  if (
    text.includes("ejemplo") ||
    text.includes("caso")
  ) {
    return "example";
  }

  if (
    text.includes("resume") ||
    text.includes("resumen") ||
    text.includes("resumelo") ||
    text.includes("en corto")
  ) {
    return "summary";
  }

  if (
    text.startsWith("que es") ||
    text.startsWith("define") ||
    text.startsWith("definicion")
  ) {
    return "definition";
  }

  return "general";
}

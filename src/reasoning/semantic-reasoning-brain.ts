import type { ReasoningEdge, ReasoningPath } from "./question-reasoner";

export type SemanticIntent =
  | "relation"
  | "compare"
  | "definition"
  | "use"
  | "cause_effect"
  | "explain";

export type SemanticReasoningResult = {
  intent: SemanticIntent;
  answerCore: string;
  explanation: string;
  reasoningSteps: string[];
  confidence: number;
};

const IMPORTANT_TYPES = new Set([
  "PART_OF",
  "IS_A",
  "DEPENDS_ON",
  "USED_FOR",
  "USES",
  "EXPLAINS",
  "DEFINES",
  "RELATED_TO",
]);

function clean(value?: string): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

function normalize(value?: string): string {
  return clean(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectIntent(question: string): SemanticIntent {
  const q = normalize(question);

  if (q.includes("relacion") || q.includes("conecta") || q.includes("conexion")) {
    return "relation";
  }

  if (q.includes("compara") || q.includes("diferencia") || q.includes("versus") || q.includes(" vs ")) {
    return "compare";
  }

  if (q.includes("para que sirve") || q.includes("uso") || q.includes("usos") || q.includes("aplicacion")) {
    return "use";
  }

  if (q.includes("afecta") || q.includes("causa") || q.includes("produce") || q.includes("cambia")) {
    return "cause_effect";
  }

  if (q.startsWith("que es") || q.startsWith("qué es") || q.startsWith("what is")) {
    return "definition";
  }

  return "explain";
}

function relationType(type: string): string {
  return type.replace(/^REVERSE_/, "").toUpperCase();
}

function relationWeight(type: string): number {
  const normalized = relationType(type);

  if (normalized === "PART_OF") return 0.95;
  if (normalized === "IS_A") return 0.92;
  if (normalized === "DEPENDS_ON") return 0.9;
  if (normalized === "USED_FOR") return 0.88;
  if (normalized === "USES") return 0.88;
  if (normalized === "EXPLAINS") return 0.86;
  if (normalized === "DEFINES") return 0.86;
  if (normalized === "RELATED_TO") return 0.78;

  return 0.62;
}

function semanticVerb(edge: ReasoningEdge): string {
  const type = relationType(edge.relationType);
  const reverse = edge.relationType.toUpperCase().startsWith("REVERSE_");

  if (!reverse) {
    if (type === "IS_A") return "es una forma o tipo de";
    if (type === "PART_OF") return "forma parte de";
    if (type === "DEPENDS_ON") return "depende de";
    if (type === "USED_FOR") return "se usa para";
    if (type === "USES") return "usa";
    if (type === "EXPLAINS") return "ayuda a explicar";
    if (type === "DEFINES") return "define";
    if (type === "PRODUCES") return "puede producir";
    if (type === "CHANGES") return "puede cambiar o afectar";
    if (type === "RELATED_TO") return "está relacionado con";
  }

  if (type === "IS_A") return "tiene como caso específico a";
  if (type === "PART_OF") return "incluye";
  if (type === "DEPENDS_ON") return "es necesario para";
  if (type === "USED_FOR") return "tiene como herramienta a";
  if (type === "USES") return "es usado por";
  if (type === "EXPLAINS") return "puede ser explicado por";
  if (type === "DEFINES") return "es definido por";
  if (type === "PRODUCES") return "puede ser resultado de";
  if (type === "CHANGES") return "puede ser afectado por";
  if (type === "RELATED_TO") return "está relacionado con";

  return "se conecta con";
}

function edgeToThought(edge: ReasoningEdge): string {
  const description = clean(edge.description);
  const base = `${edge.fromName} ${semanticVerb(edge)} ${edge.toName}`;

  if (!description || normalize(description).startsWith("reverse path")) {
    return `${base}.`;
  }

  return `${base}: ${description}.`;
}

function questionMentionsConcept(question: string, concept: string): boolean {
  const q = normalize(question);
  const c = normalize(concept);

  if (!c) return false;
  if (q.includes(c)) return true;

  const conceptTokens = c
    .split(" ")
    .filter((token) => token.length >= 3);

  return conceptTokens.length > 0 && conceptTokens.every((token) => q.includes(token));
}

function mentionedEndpointScore(question: string, path: ReasoningPath): number {
  let score = 0;

  if (questionMentionsConcept(question, path.fromConcept)) score += 5;
  if (questionMentionsConcept(question, path.toConcept)) score += 5;

  for (const step of path.steps) {
    if (questionMentionsConcept(question, step.fromName)) score += 1;
    if (questionMentionsConcept(question, step.toName)) score += 1;
  }

  return score;
}

function pathScore(question: string, path: ReasoningPath): number {
  const endpointScore = mentionedEndpointScore(question, path);

  const directBonus = path.steps.length === 1 ? 2 : path.steps.length === 2 ? 1 : 0;

  const relationScore =
    path.steps.reduce((sum, step) => sum + relationWeight(step.relationType), 0) /
    Math.max(path.steps.length, 1);

  const importantBonus = path.steps.some((step) => IMPORTANT_TYPES.has(relationType(step.relationType)))
    ? 0.8
    : 0;

  const confidenceScore = path.confidenceScore;

  const lengthPenalty = Math.max(0, (path.steps.length - 1) * 0.5);

  return endpointScore * 10 +
    directBonus +
    importantBonus +
    relationScore +
    confidenceScore -
    lengthPenalty;
}

function chooseBestPath(question: string, paths: ReasoningPath[]): ReasoningPath | null {
  if (paths.length === 0) return null;

  return [...paths].sort((a, b) => pathScore(question, b) - pathScore(question, a))[0];
}


function naturalizeDescription(description: string, from: string, to: string): string {
  const cleanDescription = clean(description)
    .replace(/^Reverse path:\s*/i, "")
    .replace(/\.+$/g, "")
    .trim();

  const normalized = normalize(cleanDescription);

  if (!cleanDescription) {
    return `${from} está conectado conceptualmente con ${to}`;
  }

  if (
    normalized.includes("related to") &&
    normalized.includes("shared curriculum topics")
  ) {
    return `${from} y ${to} aparecen conectados dentro de temas compartidos del currículo, por eso ALAI los interpreta como conceptos del mismo dominio de estudio`;
  }

  if (normalized.includes("is a type of")) {
    return `${from} es una categoría o caso dentro de ${to}`;
  }

  if (normalized.includes("branch of")) {
    return `${from} es una rama o área dentro de ${to}`;
  }

  if (normalized.includes("used to")) {
    return `${from} se usa para trabajar con ${to}`;
  }

  if (normalized.includes("used in")) {
    return `${from} se usa dentro de ${to}`;
  }

  return cleanDescription;
}

function buildRelationAnswer(path: ReasoningPath): string {
  const first = path.steps[0];

  if (path.steps.length === 1) {
    const explanation = naturalizeDescription(
      first.description,
      path.fromConcept,
      path.toConcept
    );

    return `${path.fromConcept} se relaciona con ${path.toConcept}: ${explanation}.`;
  }

  return `${path.fromConcept} se relaciona con ${path.toConcept} mediante esta cadena conceptual: ${path.steps.map((step) => step.fromName).concat(path.steps[path.steps.length - 1].toName).join(" → ")}.`;
}

function buildCompareAnswer(path: ReasoningPath): string {
  const first = path.steps[0];

  const explanation = first.description
    ? first.description.replace(/^Reverse path:\s*/i, "").trim()
    : edgeToThought(first);

  return `${path.fromConcept} y ${path.toConcept} se comparan así: ${explanation}.`;
}

function buildUseAnswer(path: ReasoningPath): string {
  const useStep =
    path.steps.find((step) =>
      ["USED_FOR", "USES"].includes(relationType(step.relationType))
    ) || path.steps[0];

  return `${edgeToThought(useStep)} En otras palabras, ALAI entiende su utilidad por la función que cumple dentro del grafo.`;
}

function buildCauseEffectAnswer(path: ReasoningPath): string {
  const effectStep =
    path.steps.find((step) =>
      ["CHANGES", "PRODUCES", "EXPLAINS", "DEPENDS_ON"].includes(relationType(step.relationType))
    ) || path.steps[0];

  return `${edgeToThought(effectStep)} Esa es la relación de causa, efecto o dependencia más fuerte que ALAI encontró.`;
}

export function runSemanticReasoningBrain(
  question: string,
  paths: ReasoningPath[]
): SemanticReasoningResult {
  const intent = detectIntent(question);
  const bestPath = chooseBestPath(question, paths);

  if (!bestPath) {
    return {
      intent,
      answerCore: "",
      explanation: "",
      reasoningSteps: [],
      confidence: 0,
    };
  }

  const reasoningSteps = bestPath.steps.map(edgeToThought);

  const answerCore =
    intent === "relation" ? buildRelationAnswer(bestPath) :
    intent === "compare" ? buildCompareAnswer(bestPath) :
    intent === "use" ? buildUseAnswer(bestPath) :
    intent === "cause_effect" ? buildCauseEffectAnswer(bestPath) :
    buildRelationAnswer(bestPath);

  const explanation =
    reasoningSteps.length > 1
      ? `ALAI no solo encontró una palabra parecida; siguió esta ruta interna: ${reasoningSteps.join(" ")}`
      : "";

  const confidence = Math.min(
    0.92,
    Math.max(
      0.62,
      bestPath.confidenceScore + (bestPath.steps.length === 1 ? 0.08 : 0.03)
    )
  );

  return {
    intent,
    answerCore,
    explanation,
    reasoningSteps,
    confidence: Number(confidence.toFixed(3)),
  };
}

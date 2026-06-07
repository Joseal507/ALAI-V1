import type { RetrievedKnowledgeContext, RetrievedRelation } from "../retrieval/knowledge-retriever";
import type { QuestionReasoningContext, ReasoningEdge } from "./question-reasoner";
import { runSemanticReasoningBrain } from "./semantic-reasoning-brain";

export type MetaReasoningResult = {
  canAnswer: boolean;
  confidence: number;
  directAnswer: string;
  explanation: string;
  reasoningSteps: string[];
  technicalNote: string;
  facts: string[];
};

function clean(value?: string): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

function normalize(value?: string): string {
  return clean(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function normalizeRelationType(type: string): { reverse: boolean; type: string } {
  const upper = type.trim().toUpperCase();

  if (upper.startsWith("REVERSE_")) {
    return {
      reverse: true,
      type: upper.replace(/^REVERSE_/, ""),
    };
  }

  return {
    reverse: false,
    type: upper,
  };
}

function relationVerb(typeRaw: string): string {
  const { reverse, type } = normalizeRelationType(typeRaw);

  if (!reverse) {
    if (type === "IS_A") return "es un tipo de";
    if (type === "PART_OF") return "forma parte de";
    if (type === "DEPENDS_ON") return "depende de";
    if (type === "USED_FOR") return "se usa para";
    if (type === "USES") return "usa";
    if (type === "RELATED_TO") return "está relacionado con";
    if (type === "CHANGES") return "puede cambiar o afectar";
    if (type === "EXPLAINS") return "ayuda a explicar";
    if (type === "PRODUCES") return "puede producir";
    if (type === "DEFINES") return "define";
    if (type === "FORMULA_RELATION") return "se conecta formalmente con";
  }

  if (type === "IS_A") return "tiene como tipo específico a";
  if (type === "PART_OF") return "incluye";
  if (type === "DEPENDS_ON") return "es necesario para";
  if (type === "USED_FOR") return "tiene como herramienta a";
  if (type === "USES") return "es usado por";
  if (type === "RELATED_TO") return "está relacionado con";
  if (type === "CHANGES") return "puede ser cambiado o afectado por";
  if (type === "EXPLAINS") return "puede ser explicado por";
  if (type === "PRODUCES") return "puede ser resultado de";
  if (type === "DEFINES") return "es definido por";
  if (type === "FORMULA_RELATION") return "se conecta formalmente con";

  return "se conecta con";
}

function edgeSentence(edge: ReasoningEdge): string {
  const description = clean(edge.description);
  const base = `${edge.fromName} ${relationVerb(edge.relationType)} ${edge.toName}`;

  if (!description || normalize(description).startsWith("reverse path")) {
    return `${base}.`;
  }

  return `${base}: ${description}.`;
}


function naturalizeRelationDescription(description: string, from: string, to: string): string {
  const text = clean(description).replace(/^Reverse path:\s*/i, "").replace(/\.+$/g, "");
  const normalized = normalize(text);

  if (!text) return `${from} se conecta con ${to}`;

  if (normalized.includes("is part of")) return `${from} forma parte de ${to}`;
  if (normalized.includes("is a type of")) return `${from} es un tipo de ${to}`;
  if (normalized.includes("is related to")) return `${from} se relaciona con ${to}`;
  if (normalized.includes("used to")) return `${from} se usa para trabajar con ${to}`;
  if (normalized.includes("used in")) return `${from} se usa dentro de ${to}`;

  return text;
}

function relationSentence(relation: RetrievedRelation): string {
  const description = naturalizeRelationDescription(
    relation.description,
    relation.fromConceptName,
    relation.toConceptName
  );

  return `${description}.`;
}

function questionIntent(question: string): "compare" | "relation" | "use" | "effect" | "explain" {
  const text = normalize(question);

  if (
    text.includes("compara") ||
    text.includes("comparar") ||
    text.includes("diferencia") ||
    text.includes("diferencias") ||
    text.includes(" versus ") ||
    text.includes(" vs ")
  ) {
    return "compare";
  }

  if (
    text.includes("relacion") ||
    text.includes("conecta") ||
    text.includes("conexion")
  ) {
    return "relation";
  }

  if (
    text.includes("para que sirve") ||
    text.includes("uso") ||
    text.includes("usos") ||
    text.includes("aplicacion")
  ) {
    return "use";
  }

  if (
    text.includes("afecta") ||
    text.includes("cambia") ||
    text.includes("modifica")
  ) {
    return "effect";
  }

  return "explain";
}

function conceptMentioned(conceptName: string, question: string): boolean {
  return normalize(question).includes(normalize(conceptName));
}

function relationTouchesConcepts(
  relation: RetrievedRelation,
  conceptNames: string[]
): boolean {
  const from = normalize(relation.fromConceptName);
  const to = normalize(relation.toConceptName);

  return conceptNames.some((name) => {
    const n = normalize(name);
    return from === n || to === n;
  });
}

function bestRetrievedRelations(
  retrievedKnowledge: RetrievedKnowledgeContext,
  conceptNames: string[]
): RetrievedRelation[] {
  return retrievedKnowledge.relations
    .filter((relation) => relation.confidenceScore >= 0.25)
    .filter((relation) => relationTouchesConcepts(relation, conceptNames))
    .sort((a, b) => b.confidenceScore - a.confidenceScore)
    .slice(0, 5);
}

function scoreFromPath(pathConfidence: number, steps: ReasoningEdge[]): number {
  const bestEdge = Math.max(...steps.map((step) => step.confidenceScore), 0);
  const pathBonus = steps.length === 1 ? 0.08 : steps.length === 2 ? 0.04 : 0;
  const blended = pathConfidence * 0.72 + bestEdge * 0.18 + pathBonus;

  return Math.min(0.94, Math.max(blended, 0.58));
}

function makeDirectAnswer(params: {
  question: string;
  concepts: string[];
  firstFact: string;
  pathLength: number;
}): string {
  const intent = questionIntent(params.question);
  const [a, b] = params.concepts;

  if (intent === "compare" && a && b) {
    return `${a} y ${b} se pueden comparar usando una conexión interna del grafo: ${params.firstFact}`;
  }

  if (intent === "relation" && a && b) {
    return `${a} se relaciona con ${b} mediante esta cadena interna: ${params.firstFact}`;
  }

  if (intent === "use") {
    return `ALAI encontró una relación de uso o función en su grafo: ${params.firstFact}`;
  }

  if (intent === "effect") {
    return `ALAI encontró una relación de cambio, efecto o explicación en su grafo: ${params.firstFact}`;
  }

  if (params.pathLength > 1 && a && b) {
    return `${a} se conecta con ${b} por una cadena de ${params.pathLength} relaciones internas.`;
  }

  return `ALAI puede responder desde su grafo interno: ${params.firstFact}`;
}

export function runMetaReasoningBrain(
  question: string,
  retrievedKnowledge: RetrievedKnowledgeContext,
  questionReasoning: QuestionReasoningContext
): MetaReasoningResult {
  const detected = questionReasoning.detectedConcepts
    .filter((concept) => conceptMentioned(concept.name, question))
    .map((concept) => concept.name);

  const conceptNames =
    detected.length > 0
      ? detected
      : questionReasoning.detectedConcepts.map((concept) => concept.name);

  const primaryConcepts = questionReasoning.detectedConcepts.slice(0, 2).map((concept) => concept.name);

  const primaryPaths =
    primaryConcepts.length >= 2
      ? questionReasoning.reasoningPaths.filter((path) => {
          const a = normalize(primaryConcepts[0]);
          const b = normalize(primaryConcepts[1]);
          const from = normalize(path.fromConcept);
          const to = normalize(path.toConcept);

          return (
            (from === a && to === b) ||
            (from === b && to === a)
          );
        })
      : [];

  const semantic = runSemanticReasoningBrain(
    question,
    primaryPaths.length > 0 ? primaryPaths : questionReasoning.reasoningPaths
  );

  if (semantic.answerCore && semantic.reasoningSteps.length > 0 && conceptNames.length >= 2) {
    return {
      canAnswer: semantic.confidence >= 0.62,
      confidence: semantic.confidence,
      directAnswer: semantic.answerCore,
      explanation: semantic.explanation,
      reasoningSteps: semantic.reasoningSteps,
      technicalNote:
        `ALAI usó razonamiento semántico de intención "${semantic.intent}" sobre su grafo interno.`,
      facts: semantic.reasoningSteps,
    };
  }

  const intent = questionIntent(question);
  const retrievedRelations = bestRetrievedRelations(retrievedKnowledge, conceptNames);

  const safeRetrievedRelations =
    conceptNames.length >= 2
      ? retrievedRelations
      : retrievedRelations.filter((relation) => {
          const type = normalizeRelationType(relation.relationType).type;

          if (intent === "use") {
            return type === "USED_FOR" || type === "USES";
          }

          return false;
        });

  if (safeRetrievedRelations.length > 0 && conceptNames.length >= 1) {
    const facts = safeRetrievedRelations.map(relationSentence);
    const bestConfidence = Math.max(...safeRetrievedRelations.map((relation) => relation.confidenceScore), 0.45);
    const confidence = Math.min(0.82, Math.max(0.58, bestConfidence + 0.18));

    return {
      canAnswer: confidence >= 0.58,
      confidence: Number(confidence.toFixed(3)),
      directAnswer:
        conceptNames.length >= 2
          ? `ALAI encontró relaciones internas relevantes: ${facts[0]}`
          : facts[0],
      explanation:
        facts.length > 1 && conceptNames.length >= 2
          ? `También tiene estas conexiones: ${facts.slice(1, 4).join(" ")}`
          : "",
      reasoningSteps: facts,
      technicalNote:
        "ALAI usó relaciones recuperadas de memoria con filtro semántico de seguridad.",
      facts,
    };
  }

  return {
    canAnswer: false,
    confidence: 0,
    directAnswer: "",
    explanation: "",
    reasoningSteps: [],
    technicalNote: "",
    facts: [],
  };
}

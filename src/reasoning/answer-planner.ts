import type { RetrievedKnowledgeContext } from "../retrieval/knowledge-retriever";
import type { QuestionReasoningContext } from "./question-reasoner";
import { runMetaReasoningBrain } from "./meta-reasoning-brain";

export interface AnswerPlan {
  canAnswerInternally: boolean;
  confidence: number;
  concepts: string[];
  facts: string[];
  reasoningSteps: string[];
  conclusion: string;
  directAnswer: string;
  explanation: string;
  example: string;
  technicalNote: string;
  source: "GRAPH" | "KNOWLEDGE" | "INSUFFICIENT";
}

export function buildAnswerPlan(
  question: string,
  retrievedKnowledge: RetrievedKnowledgeContext,
  questionReasoning: QuestionReasoningContext
): AnswerPlan {
  const concepts = questionReasoning.detectedConcepts.map((concept) => concept.name);
  const meta = runMetaReasoningBrain(question, retrievedKnowledge, questionReasoning);

  const canAnswerInternally = meta.canAnswer && meta.directAnswer.trim().length > 0;

  return {
    canAnswerInternally,
    confidence: meta.confidence,
    concepts,
    facts: meta.facts.slice(0, 8),
    reasoningSteps: meta.reasoningSteps.slice(0, 6),
    conclusion: meta.directAnswer,
    directAnswer: meta.directAnswer,
    explanation: meta.explanation,
    example: "",
    technicalNote: meta.technicalNote,
    source: canAnswerInternally
      ? "GRAPH"
      : meta.facts.length > 0
        ? "KNOWLEDGE"
        : "INSUFFICIENT",
  };
}

export function renderAnswerPlan(plan: AnswerPlan): string {
  if (!plan.canAnswerInternally) {
    return "ALAI no tiene suficiente conocimiento interno en el grafo para responder con seguridad sin un modelo externo.";
  }

  const lines: string[] = [];

  lines.push(plan.directAnswer || plan.conclusion);

  if (plan.explanation) {
    lines.push("");
    lines.push(plan.explanation);
  }

  if (plan.reasoningSteps.length > 0) {
    lines.push("");
    lines.push("Razonamiento interno de ALAI:");

    for (const step of plan.reasoningSteps.slice(0, 4)) {
      lines.push(`- ${step}`);
    }
  }

  if (plan.technicalNote) {
    lines.push("");
    lines.push(plan.technicalNote);
  }

  lines.push("");
  lines.push(`Confianza interna: ${plan.confidence}`);

  return lines.join("\n");
}

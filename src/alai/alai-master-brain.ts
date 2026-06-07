import Database from "better-sqlite3";
import crypto from "node:crypto";
import { routeAlaiMessage } from "./alai-agent-router";
import { runAlaiCore } from "./alai-core-orchestrator";
import { researchWeb, type ResearchSource } from "../research/research-engine";
import { synthesizeKnowledge } from "../research/knowledge-synthesizer";
import { learnKnowledgeFromEvidenceText } from "../autonomy/autonomous-knowledge-learner";
import { normalizeAlaiTopic } from "./alai-topic-normalizer";
import { evaluateKnowledgeSafety } from "./alai-knowledge-safety-gate";
import { recalculateConceptGovernance } from "./alai-knowledge-governance";
import { evaluateAlaiResponse } from "./alai-self-evaluation-brain";
import { retrieveKnowledgeForQuestion } from "../retrieval/knowledge-retriever";
import { reasonAboutQuestion } from "../reasoning/question-reasoner";
import { buildAnswerPlan, renderAnswerPlan } from "../reasoning/answer-planner";

export type AlaiBrainTrace = {
  brain: string;
  action: string;
  result: string;
};

export type AlaiMasterBrainResponse = {
  mode:
    | "DIRECT"
    | "MEMORY_ANSWER"
    | "RESEARCH_ANSWER"
    | "BLOCKED"
    | "UNKNOWN";
  answer: string;
  confidence: number;
  sources: string[];
  concept?: {
    id: string;
    name: string;
    status: string;
    confidence: number;
    masteryScore: number;
    masteryLevel: string;
  };
  trace: AlaiBrainTrace[];
};

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[¿?¡!]/g, "")
    .replace(/\s+/g, " ");
}

function extractTopic(message: string, conceptName?: string): string {
  if (conceptName) return conceptName;

  return normalize(message)
    .replace(/^que es /, "")
    .replace(/^qué es /, "")
    .replace(/^what is /, "")
    .replace(/^explica /, "")
    .replace(/^explícame /, "")
    .replace(/^explain /, "")
    .replace(/^define /, "")
    .trim();
}

function buildResearchQuery(message: string, conceptName?: string): string {
  const topic = extractTopic(message, conceptName);
  const lower = normalize(topic);

  const academicHints: string[] = [];

  if (
    lower.includes("suma") ||
    lower.includes("addition") ||
    lower.includes("resta") ||
    lower.includes("subtraction") ||
    lower.includes("multiplicacion") ||
    lower.includes("multiplicación") ||
    lower.includes("division") ||
    lower.includes("división")
  ) {
    academicHints.push("elementary mathematics");
  }

  if (
    lower.includes("vector") ||
    lower.includes("scalar") ||
    lower.includes("basis") ||
    lower.includes("span") ||
    lower.includes("linear")
  ) {
    academicHints.push("linear algebra");
  }

  if (
    lower.includes("celula") ||
    lower.includes("célula") ||
    lower.includes("photosynthesis") ||
    lower.includes("fotosintesis") ||
    lower.includes("fotosíntesis")
  ) {
    academicHints.push("biology");
  }

  if (
    lower.includes("education") ||
    lower.includes("educacion") ||
    lower.includes("educación") ||
    lower.includes("reading") ||
    lower.includes("writing")
  ) {
    academicHints.push("education");
  }

  return [topic, ...academicHints, "definition explanation examples"]
    .filter(Boolean)
    .join(" ");
}

function shouldPreferGraphReasoning(message: string): boolean {
  const text = normalize(message);

  return (
    text.includes("compara") ||
    text.includes("comparar") ||
    text.includes("diferencia") ||
    text.includes("diferencias") ||
    text.includes("relacion") ||
    text.includes("relación") ||
    text.includes("conecta") ||
    text.includes("conexion") ||
    text.includes("conexión") ||
    text.includes(" vs ") ||
    text.includes(" versus ")
  );
}

function sourceMatchesTopic(source: ResearchSource, topic: string): boolean {
  const text = normalize(`${source.title} ${source.snippet}`);
  const terms = normalize(topic)
    .replace(/[^a-z0-9áéíóúñü\s]/gi, " ")
    .split(/\s+/)
    .filter((term) => term.length >= 3);

  if (terms.length === 0) return false;

  const blocked = [
    "tax resistance",
    "basque country",
    "political party",
    "election",
    "archived from the original",
  ];

  if (blocked.some((term) => text.includes(term))) return false;

  return terms.some((term) => text.includes(term));
}

function saveEvidence(
  db: Database.Database,
  conceptId: string | undefined,
  source: ResearchSource
) {
  const now = new Date().toISOString();

  const existing = db.prepare(`
    SELECT id
    FROM evidence
    WHERE source_url = ?
    LIMIT 1
  `).get(source.url) as { id: string } | undefined;

  const evidenceId = existing?.id ?? crypto.randomUUID();

  if (!existing) {
    db.prepare(`
      INSERT INTO evidence (
        id,
        source_type,
        source_name,
        source_url,
        content_summary,
        reliability_score,
        captured_at
      )
      VALUES (?, 'MASTER_BRAIN_RESEARCH', ?, ?, ?, 0.6, ?)
    `).run(
      evidenceId,
      source.title,
      source.url,
      source.snippet,
      now
    );
  }

  if (conceptId) {
    db.prepare(`
      INSERT OR IGNORE INTO concept_evidence_links (
        evidence_id,
        concept_id,
        confidence_score,
        created_at
      )
      VALUES (?, ?, 0.62, ?)
    `).run(evidenceId, conceptId, now);
  }
}

function saveSelfEvaluation(
  db: Database.Database,
  params: {
    userMessage: string;
    answer: string;
    mode: string;
    confidence: number;
    conceptId?: string;
    evaluation: ReturnType<typeof evaluateAlaiResponse>;
  }
) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS alai_response_evaluations (
      id TEXT PRIMARY KEY,
      concept_id TEXT,
      user_message TEXT NOT NULL,
      answer TEXT NOT NULL,
      mode TEXT NOT NULL,
      confidence REAL NOT NULL,
      score INTEGER NOT NULL,
      strengths TEXT NOT NULL,
      weaknesses TEXT NOT NULL,
      missing_knowledge TEXT NOT NULL,
      should_research INTEGER NOT NULL,
      should_rewrite INTEGER NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO alai_response_evaluations (
      id,
      concept_id,
      user_message,
      answer,
      mode,
      confidence,
      score,
      strengths,
      weaknesses,
      missing_knowledge,
      should_research,
      should_rewrite,
      reason,
      created_at
    )
    VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    params.conceptId || null,
    params.userMessage,
    params.answer,
    params.mode,
    params.confidence,
    params.evaluation.score,
    JSON.stringify(params.evaluation.strengths),
    JSON.stringify(params.evaluation.weaknesses),
    JSON.stringify(params.evaluation.missingKnowledge),
    params.evaluation.shouldResearch ? 1 : 0,
    params.evaluation.shouldRewrite ? 1 : 0,
    params.evaluation.reason,
    now
  );
}

function withSelfEvaluation(
  db: Database.Database,
  params: AlaiMasterBrainResponse & { userMessage: string }
): AlaiMasterBrainResponse {
  const evaluation = evaluateAlaiResponse({
    userMessage: params.userMessage,
    answer: params.answer,
    mode: params.mode,
    confidence: params.confidence,
    conceptName: params.concept?.name,
    sources: params.sources,
  });

  saveSelfEvaluation(db, {
    userMessage: params.userMessage,
    answer: params.answer,
    mode: params.mode,
    confidence: params.confidence,
    conceptId: params.concept?.id,
    evaluation,
  });

  params.trace.push({
    brain: "Self Evaluation Brain",
    action: evaluation.shouldRewrite ? "flag_response" : "accept_response",
    result: `score=${evaluation.score} · ${evaluation.reason}`,
  });

  return params;
}

function renderAnswer(params: {
  message: string;
  synthesisSummary: string;
  keyPoints: string[];
  confidence: number;
  sourceTitles: string[];
  conceptName?: string;
  conceptStatus?: string;
  masteryLevel?: string;
}): string {
  const lines: string[] = [];

  lines.push(params.synthesisSummary);

  if (params.keyPoints.length > 0) {
    lines.push("");
    lines.push("Puntos clave:");
    for (const point of params.keyPoints.slice(0, 4)) {
      lines.push(`- ${point}`);
    }
  }

  if (params.conceptName) {
    lines.push("");
    lines.push(
      `En mi memoria interna esto está conectado con: ${params.conceptName}` +
      (params.conceptStatus ? ` (${params.conceptStatus}` : "") +
      (params.masteryLevel ? ` · ${params.masteryLevel})` : params.conceptStatus ? ")" : "")
    );
  }

  if (params.sourceTitles.length > 0) {
    lines.push("");
    lines.push(`Fuentes usadas: ${params.sourceTitles.join(", ")}`);
  }

  return lines.join("\n");
}

function tokenSet(value: string): Set<string> {
  return new Set(
    normalize(value)
      .replace(/[^a-z0-9áéíóúñü\s]/gi, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 3)
  );
}

function conceptMentionedInMessage(conceptName: string, message: string): boolean {
  const conceptTokens = tokenSet(conceptName);
  const messageTokens = tokenSet(message);

  if (conceptTokens.size === 0) return false;

  let matched = 0;

  for (const token of conceptTokens) {
    if (messageTokens.has(token)) matched++;
  }

  return matched === conceptTokens.size;
}

function tryGraphReasoningAnswer(
  db: Database.Database,
  message: string
): {
  answer: string;
  confidence: number;
  concepts: string[];
  traceResult: string;
} | null {
  const questionReasoning = reasonAboutQuestion(db, message);

  const filteredConcepts = questionReasoning.detectedConcepts.filter((concept) =>
    conceptMentionedInMessage(concept.name, message)
  );

  const allowedConceptIds = new Set(filteredConcepts.map((concept) => concept.id));

  const filteredReasoning = {
    ...questionReasoning,
    detectedConcepts: filteredConcepts,
    reasoningPaths: questionReasoning.reasoningPaths.filter((path) => {
      return path.steps.every((step) => (
        allowedConceptIds.has(step.fromId) ||
        allowedConceptIds.has(step.toId)
      ));
    }),
  };

  if (filteredReasoning.detectedConcepts.length < 2) {
    return null;
  }

  const retrievedKnowledge = retrieveKnowledgeForQuestion(db, message);
  const answerPlan = buildAnswerPlan(message, retrievedKnowledge, filteredReasoning);

  if (!answerPlan.canAnswerInternally || answerPlan.confidence < 0.72) {
    return null;
  }

  const answer = renderAnswerPlan(answerPlan);

  if (!answer || answer.trim().length < 20) {
    return null;
  }

  return {
    answer,
    confidence: answerPlan.confidence,
    concepts: answerPlan.concepts,
    traceResult:
      `concepts=${answerPlan.concepts.join(", ") || "none"} · ` +
      `facts=${answerPlan.facts.length} · ` +
      `reasoningSteps=${answerPlan.reasoningSteps.length} · ` +
      `confidence=${answerPlan.confidence}`,
  };
}

export async function runAlaiMasterBrain(
  message: string,
  dbPath = "data/alai.db"
): Promise<AlaiMasterBrainResponse> {
  const db = new Database(dbPath);
  const trace: AlaiBrainTrace[] = [];

  const route = routeAlaiMessage(message);
  trace.push({
    brain: "Intent Router",
    action: "classify_message",
    result: route.intent,
  });

  if (route.directAnswer) {
    trace.push({
      brain: route.intent === "MATH" ? "Math Brain" : "Conversation Brain",
      action: "direct_response",
      result: "answered_without_research",
    });

    return withSelfEvaluation(db, {
      mode: "DIRECT",
      answer: route.directAnswer,
      confidence: route.confidence,
      sources: [],
      trace,
      userMessage: message,
    });
  }

  const preferGraphReasoning = shouldPreferGraphReasoning(message);
  const earlyGraphAnswer = preferGraphReasoning
    ? tryGraphReasoningAnswer(db, message)
    : null;

  if (earlyGraphAnswer) {
    trace.push({
      brain: "Graph Reasoning Brain",
      action: "answer_from_reasoning_graph",
      result: earlyGraphAnswer.traceResult,
    });

    return withSelfEvaluation(db, {
      mode: "MEMORY_ANSWER",
      answer: earlyGraphAnswer.answer,
      confidence: earlyGraphAnswer.confidence,
      sources: ["ALAI internal reasoning graph"],
      trace,
      userMessage: message,
    });
  }

  const safeTopic = normalizeAlaiTopic(route.topic) || normalizeAlaiTopic(message) || message;
  const memory = runAlaiCore(safeTopic, dbPath);
  trace.push({
    brain: "Knowledge Brain",
    action: "search_internal_memory",
    result: memory.mode,
  });

  if (memory.mode === "CONTRADICTION_BLOCKED") {
    trace.push({
      brain: "Contradiction Brain",
      action: "block_unsafe_answer",
      result: "open_contradiction_found",
    });

    return withSelfEvaluation(db, {
      mode: "BLOCKED",
      answer:
        "Encontré conocimiento interno conflictivo sobre esa pregunta. Voy a investigarlo antes de darte una respuesta fuerte.",
      confidence: 0.2,
      sources: [],
      concept: memory.concept,
      trace,
      userMessage: message,
    });
  }

  const memoryAnswerIsStrong =
    memory.mode === "ANSWER" &&
    (
      memory.concept?.status === "CANONICAL" ||
      (
        memory.concept?.status === "VERIFIED" &&
        (
          memory.concept?.masteryLevel === "STRONG" ||
          memory.concept?.masteryLevel === "MASTERED"
        ) &&
        memory.confidence >= 0.6
      ) ||
      (
        memory.concept?.masteryLevel === "MASTERED" &&
        memory.confidence >= 0.6
      )
    );

  if (!memoryAnswerIsStrong && preferGraphReasoning) {
    const graphAnswer = tryGraphReasoningAnswer(db, message);

    if (graphAnswer) {
      trace.push({
        brain: "Graph Reasoning Brain",
        action: "answer_from_reasoning_graph_after_memory_check",
        result: graphAnswer.traceResult,
      });

      return withSelfEvaluation(db, {
        mode: "MEMORY_ANSWER",
        answer: graphAnswer.answer,
        confidence: graphAnswer.confidence,
        sources: ["ALAI internal reasoning graph"],
        concept: memory.concept,
        trace,
        userMessage: message,
      });
    }
  }

  if (memoryAnswerIsStrong) {
    trace.push({
      brain: "Knowledge Brain",
      action: "answer_from_memory",
      result: `confidence=${memory.confidence.toFixed(3)}`,
    });

    return withSelfEvaluation(db, {
      mode: "MEMORY_ANSWER",
      answer: memory.answer,
      confidence: memory.confidence,
      sources: memory.evidence.map((source) => source.sourceName),
      concept: memory.concept,
      trace,
      userMessage: message,
    });
  }

  const topic = extractTopic(message, memory.concept?.name);
  const query = buildResearchQuery(message, memory.concept?.name);

  trace.push({
    brain: "Research Brain",
    action: "build_query",
    result: query,
  });

  const research = await researchWeb(query);

  const initiallyUsefulSources = research.sources
    .filter((source) => sourceMatchesTopic(source, topic))
    .slice(0, 5);

  const safety = evaluateKnowledgeSafety({
    topic,
    sources: initiallyUsefulSources,
    memoryMode: memory.mode,
  });

  const usefulSources = safety.usefulSources.slice(0, 5);

  trace.push({
    brain: "Research Brain",
    action: "retrieve_sources",
    result: `${usefulSources.length}/${research.sources.length} useful`,
  });

  trace.push({
    brain: "Knowledge Safety Gate",
    action: safety.allowLearning ? "allow_learning" : "block_learning",
    result: safety.reason,
  });

  if (safety.allowLearning) {
    for (const source of usefulSources.slice(0, 3)) {
      saveEvidence(db, memory.concept?.id, source);
    }
  }

  const learningText = usefulSources
    .slice(0, 4)
    .map((source) => `${source.title}\n${source.snippet}`)
    .join("\n\n");

  if (safety.allowLearning && learningText.trim().length > 0) {
    const learned = await learnKnowledgeFromEvidenceText(db, learningText);

    trace.push({
      brain: "Learning Brain",
      action: "learn_from_research",
      result: `concepts=${learned.conceptsInserted}, relations=${learned.relationsInserted}, skipped=${learned.skipped}`,
    });
  } else {
    trace.push({
      brain: "Learning Brain",
      action: "skip_learning",
      result: safety.reason,
    });
  }

  const governanceTargetId = memory.concept?.id;

  if (governanceTargetId) {
    const governance = recalculateConceptGovernance(db, governanceTargetId);

    if (governance) {
      trace.push({
        brain: "Knowledge Governance",
        action: "recalculate_mastery",
        result:
          `${governance.conceptName}: ${governance.nextStatus} · ` +
          `${governance.masteryLevel} · score=${governance.masteryScore}`,
      });
    }
  }

  const updatedMemory = runAlaiCore(safeTopic, dbPath);
  const synthesis = synthesizeKnowledge(topic, usefulSources);

  trace.push({
    brain: "Synthesis Brain",
    action: "synthesize_answer",
    result: `confidence=${synthesis.confidence.toFixed(3)}`,
  });

  const confidence = Number((Math.max(
    synthesis.confidence,
    updatedMemory.confidence * 0.8,
    usefulSources.length > 0 ? 0.45 : 0.28
  ) * safety.confidenceMultiplier).toFixed(3));

  const answer = renderAnswer({
    message,
    synthesisSummary: synthesis.summary,
    keyPoints: synthesis.keyPoints,
    confidence,
    sourceTitles: synthesis.sourceTitles,
    conceptName: updatedMemory.concept?.name || memory.concept?.name,
    conceptStatus: updatedMemory.concept?.status || memory.concept?.status,
    masteryLevel: updatedMemory.concept?.masteryLevel || memory.concept?.masteryLevel,
  });

  return withSelfEvaluation(db, {
    mode: "RESEARCH_ANSWER",
    answer,
    confidence,
    sources: synthesis.sourceTitles,
    concept: updatedMemory.concept || memory.concept,
    trace,
    userMessage: message,
  });
}

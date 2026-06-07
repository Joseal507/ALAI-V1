import Database from "better-sqlite3";
import crypto from "node:crypto";
import { analyzeIntentWithAI } from "../core/ai-intent-analyzer";
import { decideStrategyFromAIAnalysis } from "../core/strategy-engine";
import { calculateKnowledgeConfidenceFromDb } from "../confidence/knowledge-confidence-from-db";
import { researchWeb } from "../research/research-engine";
import { buildResearchQuery } from "../research/research-query-builder";
import { studyAI } from "../providers/study-ai-provider";
import { retrieveKnowledgeForQuestion } from "../retrieval/knowledge-retriever";
import { buildInternalKnowledgeContext } from "../retrieval/context-builder";
import { reasonAboutQuestion, buildQuestionReasoningContext } from "../reasoning/question-reasoner";
import { buildAnswerPlan } from "../reasoning/answer-planner";
import { retrieveLanguagePatterns, buildLanguagePatternContext } from "../language/language-learning-engine";
import { renderInternalAnswerWithLanguagePatterns } from "../language/internal-language-renderer";
import { retrieveLanguageSkillContext, buildLanguageSkillContextText } from "../language/language-skill-retriever";
import { preferredOutputLanguage } from "../language/language-detector";
import {
  retrieveLanguageStrategyContext,
  mergeStrategyIntoSkillContext,
  buildLanguageStrategyContextText,
} from "../language/language-strategy-retriever";
import { learnKnowledgeFromEvidenceText } from "../autonomy/autonomous-knowledge-learner";
import { applyAlaiLanguageFeedback } from "../language/alai-language-feedback-polisher";
import { learnLanguageFeedbackFromOwnAnswer } from "../language/alai-language-auto-feedback";
import { applyAlaiLanguageRules } from "../language/alai-language-rule-polisher";
import { learnCommunicationFromOwnAnswer } from "../language/alai-communication-brain";

export type AlaiUnifiedBrainResponse = {
  mode: "INTERNAL_REASONING" | "RESEARCH_LLM" | "LLM_GENERAL" | "FALLBACK";
  answer: string;
  confidence: number;
  sources: string[];
  provider?: string;
  trace: { brain: string; action: string; result: string }[];
};

function hasCurrentInfoNeed(input: string): boolean {
  const text = input.toLowerCase();
  return (
    text.includes("latest") ||
    text.includes("current") ||
    text.includes("today") ||
    text.includes("ahora") ||
    text.includes("actual") ||
    text.includes("reciente") ||
    text.includes("último") ||
    text.includes("ultimo")
  );
}

function saveEvidenceOnce(
  db: Database.Database,
  source: { title: string; url: string; snippet: string }
): boolean {
  const existing = db.prepare(`
    SELECT id FROM evidence
    WHERE source_url = ?
    LIMIT 1
  `).get(source.url) as { id: string } | undefined;

  if (existing) return false;

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
    VALUES (?, 'UNIFIED_BRAIN_RESEARCH', ?, ?, ?, 0.58, ?)
  `).run(
    crypto.randomUUID(),
    source.title,
    source.url,
    source.snippet,
    new Date().toISOString()
  );

  return true;
}


function cleanTopicFromQuestion(input: string): string {
  return input
    .trim()
    .replace(/^quien fue\s+/i, "")
    .replace(/^quién fue\s+/i, "")
    .replace(/^que es\s+/i, "")
    .replace(/^qué es\s+/i, "")
    .replace(/^what is\s+/i, "")
    .replace(/^who was\s+/i, "")
    .replace(/[¿?¡!]/g, "")
    .trim();
}

function getOrCreateWorldConcept(
  db: Database.Database,
  input: string,
  sources: { title: string; snippet: string }[]
): string | null {
  const name = cleanTopicFromQuestion(input);
  if (!name || name.length < 3) return null;

  const existing = db.prepare(`
    SELECT id
    FROM concepts
    WHERE lower(name) = lower(?)
    LIMIT 1
  `).get(name) as { id: string } | undefined;

  const description =
    sources.find((source) => source.snippet && source.snippet.length > 40)?.snippet ||
    `World knowledge concept learned from research: ${name}`;

  const now = new Date().toISOString();

  if (existing) {
    db.prepare(`
      UPDATE concepts
      SET confidence_score = MAX(confidence_score, 0.62),
          uncertainty_score = MIN(uncertainty_score, 0.38),
          updated_at = ?
      WHERE id = ?
    `).run(now, existing.id);

    return existing.id;
  }

  const id = crypto.randomUUID();

  db.prepare(`
    INSERT INTO concepts (
      id,
      name,
      description,
      status,
      confidence_score,
      uncertainty_score,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, 'PENDING', 0.62, 0.38, ?, ?)
  `).run(id, name, description, now, now);

  return id;
}

function linkEvidenceToConcept(
  db: Database.Database,
  conceptId: string,
  sourceUrls: string[]
) {
  const now = new Date().toISOString();

  db.exec(`
    CREATE TABLE IF NOT EXISTS concept_evidence_links (
      evidence_id TEXT NOT NULL,
      concept_id TEXT NOT NULL,
      confidence_score REAL NOT NULL DEFAULT 0.35,
      created_at TEXT NOT NULL,
      PRIMARY KEY (evidence_id, concept_id)
    );
  `);

  const rows = db.prepare(`
    SELECT id, source_url
    FROM evidence
    WHERE source_url IN (${sourceUrls.map(() => "?").join(",") || "''"})
  `).all(...sourceUrls) as { id: string; source_url: string }[];

  for (const row of rows) {
    db.prepare(`
      INSERT OR IGNORE INTO concept_evidence_links (
        evidence_id,
        concept_id,
        confidence_score,
        created_at
      )
      VALUES (?, ?, 0.68, ?)
    `).run(row.id, conceptId, now);
  }
}

function getEvidenceForTopic(
  db: Database.Database,
  input: string
): {
  conceptName: string;
  evidence: { sourceName: string; summary: string; reliability: number }[];
} | null {
  const topic = cleanTopicFromQuestion(input);
  if (!topic) return null;

  const concept = db.prepare(`
    SELECT id, name, confidence_score AS confidence
    FROM concepts
    WHERE lower(name) = lower(?)
    LIMIT 1
  `).get(topic) as { id: string; name: string; confidence: number } | undefined;

  if (!concept) return null;

  const evidence = db.prepare(`
    SELECT DISTINCT
      e.source_name AS sourceName,
      e.content_summary AS summary,
      e.reliability_score AS reliability
    FROM evidence e
    JOIN concept_evidence_links cel ON cel.evidence_id = e.id
    WHERE cel.concept_id = ?
      AND length(e.content_summary) > 40
    ORDER BY cel.confidence_score DESC, e.reliability_score DESC, e.captured_at DESC
    LIMIT 5
  `).all(concept.id) as { sourceName: string; summary: string; reliability: number }[];

  if (evidence.length === 0) return null;

  return {
    conceptName: concept.name,
    evidence,
  };
}

function renderEvidenceAnswer(
  input: string,
  conceptName: string,
  evidence: { sourceName: string; summary: string }[]
): string {
  const lower = input.toLowerCase();
  const isWho = lower.startsWith("quien fue") || lower.startsWith("quién fue") || lower.startsWith("who was");

  const lines: string[] = [];

  if (isWho) {
    lines.push(`${conceptName} fue una figura sobre la que ALAI ya tiene evidencia interna guardada.`);
  } else {
    lines.push(`${conceptName} es un concepto sobre el que ALAI ya tiene evidencia interna guardada.`);
  }

  lines.push("");

  lines.push("Lo que ALAI sabe por ahora:");
  for (const item of evidence.slice(0, 4)) {
    lines.push(`- ${item.summary}`);
  }

  lines.push("");
  lines.push(`Fuentes internas usadas: ${evidence.map((item) => item.sourceName).slice(0, 4).join(", ")}`);

  return lines.join("\n");
}

export async function runAlaiUnifiedBrain(
  input: string,
  dbPath = "data/alai.db"
): Promise<AlaiUnifiedBrainResponse> {
  const db = new Database(dbPath);
  const trace: AlaiUnifiedBrainResponse["trace"] = [];

  const knowledgeConfidence = calculateKnowledgeConfidenceFromDb(db, input);
  const retrievedKnowledge = retrieveKnowledgeForQuestion(db, input);
  const internalKnowledgeContext = buildInternalKnowledgeContext(retrievedKnowledge);
  const questionReasoning = reasonAboutQuestion(db, input);
  const questionReasoningContext = buildQuestionReasoningContext(questionReasoning);
  const answerPlan = buildAnswerPlan(input, retrievedKnowledge, questionReasoning);

  const languagePatterns = retrieveLanguagePatterns(db, input);
  const languagePatternContext = buildLanguagePatternContext(languagePatterns);
  const languageSkillContext = retrieveLanguageSkillContext(db, input);
  const languageStrategyContext = retrieveLanguageStrategyContext(db, input);
  const mergedLanguageSkillContext = mergeStrategyIntoSkillContext(languageSkillContext, languageStrategyContext);
  const languageSkillContextText = buildLanguageSkillContextText(mergedLanguageSkillContext);
  const languageStrategyContextText = buildLanguageStrategyContextText(languageStrategyContext);
  const outputLanguage = preferredOutputLanguage(input);

  trace.push({
    brain: "Unified Brain",
    action: "load_internal_context",
    result:
      `confidence=${knowledgeConfidence.confidence} · ` +
      `concepts=${knowledgeConfidence.matchedConcepts} · ` +
      `graphPaths=${questionReasoning.reasoningPaths.length}`,
  });

  const earlyEvidenceMemory = getEvidenceForTopic(db, input);

  if (
    earlyEvidenceMemory &&
    earlyEvidenceMemory.evidence.length >= 2 &&
    !hasCurrentInfoNeed(input)
  ) {
    return {
      mode: "INTERNAL_REASONING",
      answer: renderEvidenceAnswer(input, earlyEvidenceMemory.conceptName, earlyEvidenceMemory.evidence),
      confidence: 0.66,
      sources: earlyEvidenceMemory.evidence.map((item) => item.sourceName),
      trace: [
        ...trace,
        {
          brain: "Evidence Memory Brain",
          action: "answer_from_existing_evidence_without_research_or_llm",
          result: `concept=${earlyEvidenceMemory.conceptName} · evidence=${earlyEvidenceMemory.evidence.length}`,
        },
      ],
    };
  }

  if (
    answerPlan.canAnswerInternally &&
    answerPlan.confidence >= 0.62 &&
    !hasCurrentInfoNeed(input)
  ) {
    const rawAnswer = renderInternalAnswerWithLanguagePatterns(
      answerPlan,
      languagePatterns,
      mergedLanguageSkillContext,
      outputLanguage
    );

    learnLanguageFeedbackFromOwnAnswer(db, rawAnswer);
    learnLanguageFeedbackFromOwnAnswer(db, rawAnswer);
    const feedbackAnswer = applyAlaiLanguageFeedback(db, rawAnswer);
    const answer = applyAlaiLanguageRules(db, feedbackAnswer);

    learnCommunicationFromOwnAnswer({
      db,
      userInput: input,
      rawAnswer,
      finalAnswer: answer,
      outputLanguage,
    });

    learnCommunicationFromOwnAnswer({
      db,
      userInput: input,
      rawAnswer,
      finalAnswer: answer,
      outputLanguage,
    });

    return {
      mode: "INTERNAL_REASONING",
      answer,
      confidence: answerPlan.confidence,
      sources: ["ALAI internal knowledge graph"],
      trace: [
        ...trace,
        {
          brain: "Graph Reasoning Brain",
          action: "answer_internally",
          result: `answerPlanConfidence=${answerPlan.confidence}`,
        },
      ],
    };
  }

  let analysis;
  let decision;
  let needsResearch = hasCurrentInfoNeed(input);
  let researchContext = "";
  let sources: string[] = [];

  try {
    analysis = await analyzeIntentWithAI(input);
    decision = decideStrategyFromAIAnalysis(analysis);

    needsResearch =
      needsResearch ||
      decision.needsCurrentInfo ||
      decision.needsResearch ||
      (
        knowledgeConfidence.shouldResearch &&
        knowledgeConfidence.confidence < 0.45
      );

    trace.push({
      brain: "AI Intent Analyzer",
      action: "classify_strategy",
      result: `${decision.mode} · research=${needsResearch}`,
    });
  } catch (error) {
    trace.push({
      brain: "AI Intent Analyzer",
      action: "fallback",
      result: error instanceof Error ? error.message : "unknown_error",
    });
  }

  if (needsResearch) {
    try {
      const queryPlan = await buildResearchQuery(input);
      const research = await researchWeb(queryPlan.searchQuery);
      const topSources = research.sources.slice(0, 4);

      sources = topSources.map((source) => source.title);

      researchContext = [
        `Optimized search query: ${queryPlan.searchQuery}`,
        `Query reason: ${queryPlan.reason}`,
        "",
        ...topSources.map((source, index) => (
          `[${index + 1}] ${source.title}\nURL: ${source.url}\nSnippet: ${source.snippet}`
        )),
      ].join("\n\n");

      for (const source of topSources.slice(0, 3)) {
        saveEvidenceOnce(db, source);
      }

      const worldConceptId = getOrCreateWorldConcept(db, input, topSources);
      if (worldConceptId) {
        linkEvidenceToConcept(
          db,
          worldConceptId,
          topSources.slice(0, 3).map((source) => source.url)
        );
      }

      const learningText = topSources
        .map((source) => `${source.title}\n${source.snippet}`)
        .join("\n\n");

      if (learningText.trim()) {
        await learnKnowledgeFromEvidenceText(db, learningText);
      }

      trace.push({
        brain: "Research + Learning Brain",
        action: "research_and_learn",
        result: `sources=${topSources.length}`,
      });
    } catch (error) {
      trace.push({
        brain: "Research Brain",
        action: "research_failed",
        result: error instanceof Error ? error.message : "unknown_error",
      });
    }
  }

  const postResearchKnowledgeConfidence = calculateKnowledgeConfidenceFromDb(db, input);
  const postResearchRetrievedKnowledge = retrieveKnowledgeForQuestion(db, input);
  const postResearchReasoning = reasonAboutQuestion(db, input);
  const postResearchAnswerPlan = buildAnswerPlan(
    input,
    postResearchRetrievedKnowledge,
    postResearchReasoning
  );

  if (
    postResearchAnswerPlan.canAnswerInternally &&
    postResearchKnowledgeConfidence.confidence >= 0.55 &&
    !hasCurrentInfoNeed(input)
  ) {
    const postResearchLanguagePatterns = retrieveLanguagePatterns(db, input);
    const postResearchLanguageSkillContext = retrieveLanguageSkillContext(db, input);
    const postResearchLanguageStrategyContext = retrieveLanguageStrategyContext(db, input);
    const postResearchMergedSkillContext = mergeStrategyIntoSkillContext(
      postResearchLanguageSkillContext,
      postResearchLanguageStrategyContext
    );

    const rawAnswer = renderInternalAnswerWithLanguagePatterns(
      postResearchAnswerPlan,
      postResearchLanguagePatterns,
      postResearchMergedSkillContext,
      outputLanguage
    );

    const feedbackAnswer = applyAlaiLanguageFeedback(db, rawAnswer);
    const answer = applyAlaiLanguageRules(db, feedbackAnswer);

    return {
      mode: "INTERNAL_REASONING",
      answer,
      confidence: Math.max(
        postResearchAnswerPlan.confidence,
        postResearchKnowledgeConfidence.confidence
      ),
      sources: [
        "ALAI internal knowledge graph",
        ...sources,
      ],
      trace: [
        ...trace,
        {
          brain: "Post-Research Internal Reasoning",
          action: "answer_after_learning_without_llm",
          result:
            `confidence=${postResearchKnowledgeConfidence.confidence} · ` +
            `concepts=${postResearchKnowledgeConfidence.matchedConcepts} · ` +
            `graphPaths=${postResearchReasoning.reasoningPaths.length}`,
        },
      ],
    };
  }

  const evidenceMemory = getEvidenceForTopic(db, input);

  if (
    evidenceMemory &&
    evidenceMemory.evidence.length >= 2 &&
    !hasCurrentInfoNeed(input)
  ) {
    return {
      mode: "INTERNAL_REASONING",
      answer: renderEvidenceAnswer(input, evidenceMemory.conceptName, evidenceMemory.evidence),
      confidence: 0.64,
      sources: evidenceMemory.evidence.map((item) => item.sourceName),
      trace: [
        ...trace,
        {
          brain: "Evidence Memory Brain",
          action: "answer_from_linked_evidence_without_llm",
          result: `concept=${evidenceMemory.conceptName} · evidence=${evidenceMemory.evidence.length}`,
        },
      ],
    };
  }

  try {
    const answer = await studyAI({
      messages: [
        {
          role: "system",
          content: `
You are ALAI, an academic AI assistant with its own internal knowledge system.

Answer the user's actual question.

Use this priority:
1. Use ALAI internal knowledge when relevant.
2. Use graph reasoning and answer plan when useful.
3. Use research context when available.
4. If internal knowledge is weak, use general reasoning from the model.
5. Be honest about uncertainty.
6. Do not expose JSON, traces, or hidden implementation details.
7. Respond naturally in the user's language.

Knowledge confidence:
${JSON.stringify(knowledgeConfidence, null, 2)}

Internal knowledge context:
${internalKnowledgeContext}

Graph reasoning context:
${questionReasoningContext}

Answer plan:
${JSON.stringify(answerPlan, null, 2)}

Language patterns:
${languagePatternContext}

Language skills:
${languageSkillContextText}

Language strategy:
${languageStrategyContextText}

Research context:
${researchContext || "No external research context available."}
          `.trim(),
        },
        {
          role: "user",
          content: input,
        },
      ],
      temperature: 0.35,
      maxTokens: 1400,
    });

    const fallbackLearningText = [
      `User question: ${input}`,
      `ALAI fallback answer: ${answer.text}`,
      researchContext ? `Research context: ${researchContext}` : "",
    ].filter(Boolean).join("\n\n");

    try {
      const learned = await learnKnowledgeFromEvidenceText(db, fallbackLearningText);

      trace.push({
        brain: "Fallback Learning Brain",
        action: "learn_from_fallback_answer",
        result: `concepts=${learned.conceptsInserted}, relations=${learned.relationsInserted}, skipped=${learned.skipped}`,
      });
    } catch (learningError) {
      trace.push({
        brain: "Fallback Learning Brain",
        action: "learn_from_fallback_answer_failed",
        result: learningError instanceof Error ? learningError.message : "unknown_error",
      });
    }

    return {
      mode: needsResearch ? "RESEARCH_LLM" : "LLM_GENERAL",
      answer: answer.text,
      confidence: needsResearch ? 0.72 : Math.max(0.62, knowledgeConfidence.confidence),
      sources,
      provider: answer.provider,
      trace: [
        ...trace,
        {
          brain: "LLM Reasoning Fallback",
          action: "generate_final_answer",
          result: answer.provider,
        },
      ],
    };
  } catch (error) {
    return {
      mode: "FALLBACK",
      answer:
        "ALAI no pudo generar una respuesta completa ahora mismo, pero sí detectó la pregunta. Necesita revisar su proveedor de IA o investigar más antes de responder con seguridad.",
      confidence: 0.2,
      sources,
      trace: [
        ...trace,
        {
          brain: "Unified Brain",
          action: "final_fallback",
          result: error instanceof Error ? error.message : "unknown_error",
        },
      ],
    };
  }
}

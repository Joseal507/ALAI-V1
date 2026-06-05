import Database from "better-sqlite3";
import crypto from "node:crypto";
import { analyzeIntentWithAI } from "../src/core/ai-intent-analyzer";
import { decideStrategyFromAIAnalysis } from "../src/core/strategy-engine";
import { calculateKnowledgeConfidenceFromDb } from "../src/confidence/knowledge-confidence-from-db";
import { researchWeb } from "../src/research/research-engine";
import { buildResearchQuery } from "../src/research/research-query-builder";
import { studyAI } from "../src/providers/study-ai-provider";
import { retrieveKnowledgeForQuestion } from "../src/retrieval/knowledge-retriever";
import { buildInternalKnowledgeContext } from "../src/retrieval/context-builder";
import { reasonAboutQuestion, buildQuestionReasoningContext } from "../src/reasoning/question-reasoner";
import { retrieveLanguagePatterns, buildLanguagePatternContext } from "../src/language/language-learning-engine";
import { renderInternalAnswerWithLanguagePatterns } from "../src/language/internal-language-renderer";
import { retrieveLanguageSkillContext, buildLanguageSkillContextText } from "../src/language/language-skill-retriever";
import { preferredOutputLanguage } from "../src/language/language-detector";
import { buildAnswerPlan, renderAnswerPlan } from "../src/reasoning/answer-planner";

async function main() {
  const input = process.argv.slice(2).join(" ").trim();

  if (!input) {
    console.error('Usage: npm run alai -- "your question"');
    process.exit(1);
  }

  const db = new Database("data/alai.db");

  const knowledgeConfidence = calculateKnowledgeConfidenceFromDb(db, input);
  const retrievedKnowledge = retrieveKnowledgeForQuestion(db, input);
  const internalKnowledgeContext = buildInternalKnowledgeContext(retrievedKnowledge);
  const questionReasoning = reasonAboutQuestion(db, input);
  const questionReasoningContext = buildQuestionReasoningContext(questionReasoning);
  const answerPlan = buildAnswerPlan(input, retrievedKnowledge, questionReasoning);
  const languagePatterns = retrieveLanguagePatterns(db, input);
  const languagePatternContext = buildLanguagePatternContext(languagePatterns);
  const languageSkillContext = retrieveLanguageSkillContext(db, input);
  const languageSkillContextText = buildLanguageSkillContextText(languageSkillContext);
  const outputLanguage = preferredOutputLanguage(input);

  if (
    answerPlan.canAnswerInternally &&
    knowledgeConfidence.confidence >= 0.65 &&
    !input.toLowerCase().includes("latest") &&
    !input.toLowerCase().includes("current") &&
    !input.toLowerCase().includes("today")
  ) {
    console.log("\n=== ALAI Mode ===");
    console.log("INTERNAL_ONLY");

    console.log("\n=== ALAI Knowledge Confidence ===");
    console.log(JSON.stringify(knowledgeConfidence, null, 2));

    console.log("\n=== ALAI Graph Reasoning Context ===");
    console.log(questionReasoningContext);

    console.log("\n=== ALAI Answer Plan ===");
    console.log(JSON.stringify(answerPlan, null, 2));

    console.log("\n=== ALAI Language Pattern Context ===");
    console.log(languagePatternContext);

    console.log("\n=== ALAI Language Skill Context ===");
    console.log(languageSkillContextText);

    console.log("\n=== ALAI Answer ===");
    console.log(renderInternalAnswerWithLanguagePatterns(answerPlan, languagePatterns, languageSkillContext, outputLanguage));
    return;
  }

  const analysis = await analyzeIntentWithAI(input);
  const decision = decideStrategyFromAIAnalysis(analysis);

  const hasUsableInternalKnowledge =
    knowledgeConfidence.confidence >= 0.35 &&
    knowledgeConfidence.matchedConcepts > 0 &&
    knowledgeConfidence.matchedEvidence > 0 &&
    knowledgeConfidence.matchedCapabilities > 0;

  const shouldResearch =
    decision.needsCurrentInfo ||
    decision.needsResearch ||
    (!hasUsableInternalKnowledge && knowledgeConfidence.shouldResearch);

  let researchContext = "";
  let savedEvidenceCount = 0;

  if (shouldResearch) {
    const queryPlan = await buildResearchQuery(input);
    const research = await researchWeb(queryPlan.searchQuery);

    researchContext = [
      `Optimized search query: ${queryPlan.searchQuery}`,
      `Query reason: ${queryPlan.reason}`,
      "",
      ...research.sources.map((source, index) => {
        return `[${index + 1}] ${source.title}\nURL: ${source.url}\nSnippet: ${source.snippet}`;
      }),
    ].join("\n\n");

    const now = new Date().toISOString();

    for (const source of research.sources.slice(0, 3)) {
      db.prepare(`
        INSERT INTO evidence (
          id,
          source_type,
          source_name,
          source_url,
          content_summary,
          reliability_score,
          captured_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        crypto.randomUUID(),
        "WEBSITE",
        source.title,
        source.url,
        source.snippet,
        0.55,
        now
      );

      savedEvidenceCount++;
    }
  }

  console.log("\n=== ALAI Strategy ===");
  console.log(JSON.stringify(decision, null, 2));

  console.log("\n=== ALAI Knowledge Confidence ===");
  console.log(JSON.stringify(knowledgeConfidence, null, 2));

  console.log("\n=== ALAI Internal Knowledge Context ===");
  console.log(internalKnowledgeContext);

  console.log("\n=== ALAI Graph Reasoning Context ===");
  console.log(questionReasoningContext);

  console.log("\n=== ALAI Answer Plan ===");
  console.log(JSON.stringify(answerPlan, null, 2));

  console.log("\n=== ALAI Language Pattern Context ===");
  console.log(languagePatternContext);

  console.log("\n=== ALAI Language Skill Context ===");
  console.log(languageSkillContextText);

  if (researchContext) {
    console.log("\n=== ALAI Research Context ===");
    console.log(researchContext);
    console.log(`\nSaved evidence items: ${savedEvidenceCount}`);
  }

  const answer = await studyAI({
    messages: [
      {
        role: "system",
        content: `
You are ALAI, an academic AI assistant.

Use the following internal decision data to answer well.

Strategy:
${JSON.stringify(decision, null, 2)}

Knowledge confidence:
${JSON.stringify(knowledgeConfidence, null, 2)}

Internal knowledge context:
${internalKnowledgeContext}

Graph reasoning context:
${questionReasoningContext}

Answer plan:
${JSON.stringify(answerPlan, null, 2)}

Learned language patterns:
${languagePatternContext}

Language skill graph:
${languageSkillContextText}

Research context:
${researchContext || "No external research context available."}

Rules:
- Answer the user's actual question.
- Use the answer plan first when it is available.
- Use internal knowledge first when it is relevant.
- If research context is available, use it to improve or verify the answer.
- If research was needed but sources are weak or missing, be honest and answer cautiously.
- Do not expose internal JSON.
- Do not say "I cannot access real-time info" if research context exists.
- Adapt depth, tone, and format to the user's request.
        `.trim(),
      },
      {
        role: "user",
        content: input,
      },
    ],
    temperature: 0.35,
    maxTokens: 1200,
  });

  console.log("\n=== ALAI Answer ===");
  console.log(`Provider: ${answer.provider}`);
  console.log(answer.text);
}

main().catch((error) => {
  console.error("ALAI failed:");
  console.error(error);
  process.exit(1);
});

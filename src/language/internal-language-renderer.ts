import type { AnswerPlan } from "../reasoning/answer-planner";
import type { LearnedLanguagePattern } from "./language-learning-engine";
import type { LanguageSkillContext } from "./language-skill-retriever";
import type { DetectedLanguage } from "./language-detector";
import { executeLanguageSkills } from "./language-skill-executor";

function hasPattern(patterns: LearnedLanguagePattern[], type: string): boolean {
  return patterns.some((pattern) => pattern.patternType === type);
}

function hasSkill(skillContext: LanguageSkillContext | undefined, name: string): boolean {
  return Boolean(skillContext?.skills.some((skill) => skill.name === name));
}

function hasSkillRelation(
  skillContext: LanguageSkillContext | undefined,
  from: string,
  relationType: string,
  to: string
): boolean {
  return Boolean(
    skillContext?.relations.some(
      (relation) =>
        relation.fromSkill === from &&
        relation.relationType === relationType &&
        relation.toSkill === to
    )
  );
}

function prefersCasual(
  patterns: LearnedLanguagePattern[],
  skillContext?: LanguageSkillContext
): boolean {
  return (
    hasSkill(skillContext, "casual_tone") ||
    patterns.some((pattern) => pattern.styleSummary.toLowerCase().includes("casual"))
  );
}

function prefersShort(
  patterns: LearnedLanguagePattern[],
  skillContext?: LanguageSkillContext
): boolean {
  return hasSkill(skillContext, "summarize") || hasPattern(patterns, "LENGTH_CONTROL");
}

function prefersParaphraseOrUserVoice(
  patterns: LearnedLanguagePattern[],
  skillContext?: LanguageSkillContext
): boolean {
  return (
    hasSkill(skillContext, "user_voice") ||
    hasSkill(skillContext, "paraphrase") ||
    hasPattern(patterns, "PARAPHRASE") ||
    hasPattern(patterns, "PERSONA_MATCH") ||
    patterns.some((pattern) => pattern.styleSummary.toLowerCase().includes("user's voice"))
  );
}

export function renderInternalAnswerWithLanguagePatterns(
  plan: AnswerPlan,
  patterns: LearnedLanguagePattern[],
  skillContext?: LanguageSkillContext,
  outputLanguage: DetectedLanguage = "unknown"
): string {
  if (!plan.canAnswerInternally) {
    return "ALAI does not have enough internal graph knowledge to answer confidently without an external model.";
  }

  const casual = prefersCasual(patterns, skillContext);
  const short = prefersShort(patterns, skillContext);
  const userVoice = prefersParaphraseOrUserVoice(patterns, skillContext);
  const hideReasoning = shouldHideReasoning(patterns, skillContext);

  const mustPreserveMeaning =
    hasSkillRelation(skillContext, "summarize", "REQUIRES", "preserve_core_meaning") ||
    hasSkillRelation(skillContext, "summarize", "REQUIRES", "preserve_main_idea") ||
    hasSkillRelation(skillContext, "paraphrase", "REQUIRES", "preserve_main_idea");

  const shouldSimplify =
    hasSkill(skillContext, "simplify") ||
    hasSkillRelation(skillContext, "casual_tone", "OFTEN_USES", "simplify");

  const shouldReduceLength =
    hasSkillRelation(skillContext, "summarize", "USES", "reduce_sentence_length");

  const shouldRemoveRedundantDetail =
    hasSkillRelation(skillContext, "summarize", "USES", "remove_redundant_detail");

  const examplePattern = patterns.find((pattern) => pattern.outputExample.trim().length > 0);
  const base = examplePattern
    ? adaptExampleToPlan(examplePattern.outputExample, plan)
    : plan.conclusion;

  const main = executeLanguageSkills(base, skillContext, outputLanguage);

  if (short && casual) {
    return [
      outputLanguage === "es" ? "En corto:" : "Short version:",
      main,
      "",
      outputLanguage === "es"
        ? `Confianza interna: ${plan.confidence}`
        : `Internal confidence: ${plan.confidence}`,
    ].join("\n");
  }

  if (short) {
    return [
      main,
      "",
      outputLanguage === "es"
        ? `Confianza interna: ${plan.confidence}`
        : `Internal confidence: ${plan.confidence}`,
    ].join("\n");
  }

  if (casual) {
    if (hideReasoning) {
      return [
        outputLanguage === "es" ? "Básicamente:" : "Basically:",
        main,
        "",
        outputLanguage === "es"
          ? `Confianza interna: ${plan.confidence}`
          : `Internal confidence: ${plan.confidence}`,
      ].join("\n");
    }

    return [
      outputLanguage === "es" ? "Básicamente:" : "Basically:",
      main,
      "",
      outputLanguage === "es" ? "Cómo lo sabe ALAI:" : "How ALAI knows:",
      ...plan.reasoningSteps.slice(0, 2).map((step) => `- ${simplifyReasoning(step)}`),
      "",
      outputLanguage === "es"
        ? `Confianza interna: ${plan.confidence}`
        : `Internal confidence: ${plan.confidence}`,
    ].join("\n");
  }

  return [
    main,
    "",
    "Reasoning from ALAI's graph:",
    ...plan.reasoningSteps.slice(0, 3).map((step) => `- ${step}`),
    "",
    `Internal confidence: ${plan.confidence}`,
  ].join("\n");
}

function applyLanguageSkills(
  value: string,
  options: {
    shouldSimplify: boolean;
    shouldReduceLength: boolean;
    shouldRemoveRedundantDetail: boolean;
    mustPreserveMeaning: boolean;
  }
): string {
  let output = value.trim();

  if (options.shouldSimplify) {
    output = simplifySentence(output);
  }

  if (options.shouldRemoveRedundantDetail) {
    output = removeRedundantDetail(output);
  }

  if (options.shouldReduceLength) {
    output = reduceSentenceLength(output);
  }

  if (options.mustPreserveMeaning && output.length === 0) {
    return value.trim();
  }

  return output.trim();
}

function simplifySentence(value: string): string {
  return value
    .replace("In physics terms, ", "")
    .replace("net torque equals the time derivative of angular momentum", "torque changes angular momentum")
    .replace("so applying torque changes the magnitude or direction of angular momentum", "so torque can change how something spins")
    .replace(/\s+/g, " ")
    .trim();
}

function removeRedundantDetail(value: string): string {
  const sentences = value
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const result: string[] = [];

  for (const sentence of sentences) {
    const key = sentence.toLowerCase().replace(/[^a-záéíóúñ0-9 ]/gi, "");

    if (seen.has(key)) continue;

    seen.add(key);
    result.push(sentence);
  }

  return result.join(" ");
}

function reduceSentenceLength(value: string): string {
  const firstSentence = value.split(/(?<=[.!?])\s+/)[0]?.trim();

  if (!firstSentence) return value.trim();

  return firstSentence.endsWith(".") ? firstSentence : `${firstSentence}.`;
}

function simplifyReasoning(value: string): string {
  return value
    .replace("Because ", "")
    .replace("REVERSE_", "reverse ")
    .replace("net torque equals the time derivative of angular momentum", "torque changes angular momentum")
    .replace(/\s+/g, " ")
    .trim();
}

function adaptExampleToPlan(example: string, plan: AnswerPlan): string {
  const cleaned = example.trim();

  if (!cleaned) return plan.conclusion;

  const hasTorque = plan.concepts.some((concept) => concept.toLowerCase() === "torque");
  const hasAngularMomentum = plan.concepts.some((concept) =>
    concept.toLowerCase() === "angular momentum"
  );

  if (hasTorque && hasAngularMomentum) {
    return cleaned;
  }

  return cleaned;
}


function shouldHideReasoning(
  patterns: LearnedLanguagePattern[],
  skillContext?: LanguageSkillContext
): boolean {
  const hasShortPattern = patterns.some(
    (pattern) => pattern.patternType === "LENGTH_CONTROL"
  );

  const hasNaturalSkill = Boolean(
    skillContext?.skills.some((skill) => skill.name === "natural_language")
  );

  const hasSummarizeSkill = Boolean(
    skillContext?.skills.some((skill) => skill.name === "summarize")
  );

  const hasNaturalRelation = Boolean(
    skillContext?.relations.some(
      (relation) =>
        relation.fromSkill === "natural_language" ||
        relation.toSkill === "natural_language"
    )
  );

  return hasShortPattern || hasNaturalSkill || hasSummarizeSkill || hasNaturalRelation;
}

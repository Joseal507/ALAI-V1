import type { AnswerPlan } from "../reasoning/answer-planner";
import type { LearnedLanguagePattern } from "./language-learning-engine";

function hasPattern(patterns: LearnedLanguagePattern[], type: string): boolean {
  return patterns.some((pattern) => pattern.patternType === type);
}

function prefersCasual(patterns: LearnedLanguagePattern[]): boolean {
  return patterns.some((pattern) =>
    pattern.styleSummary.toLowerCase().includes("casual")
  );
}

function prefersShort(patterns: LearnedLanguagePattern[]): boolean {
  return hasPattern(patterns, "LENGTH_CONTROL");
}

function prefersParaphraseOrUserVoice(patterns: LearnedLanguagePattern[]): boolean {
  return (
    hasPattern(patterns, "PARAPHRASE") ||
    hasPattern(patterns, "PERSONA_MATCH") ||
    patterns.some((pattern) => pattern.styleSummary.toLowerCase().includes("user's voice"))
  );
}

export function renderInternalAnswerWithLanguagePatterns(
  plan: AnswerPlan,
  patterns: LearnedLanguagePattern[]
): string {
  if (!plan.canAnswerInternally) {
    return "ALAI does not have enough internal graph knowledge to answer confidently without an external model.";
  }

  const casual = prefersCasual(patterns);
  const short = prefersShort(patterns);
  const userVoice = prefersParaphraseOrUserVoice(patterns);

  const examplePattern = patterns.find((pattern) => pattern.outputExample.trim().length > 0);
  const main = examplePattern
    ? adaptExampleToPlan(examplePattern.outputExample, plan)
    : plan.conclusion;

  if (short && casual) {
    return [
      userVoice ? "En corto:" : "Short version:",
      simplifySentence(main),
      "",
      `Confianza interna: ${plan.confidence}`,
    ].join("\n");
  }

  if (short) {
    return [
      simplifySentence(main),
      "",
      `Internal confidence: ${plan.confidence}`,
    ].join("\n");
  }

  if (casual) {
    return [
      userVoice ? "Básicamente:" : "Basically:",
      simplifySentence(main),
      "",
      "How ALAI knows:",
      ...plan.reasoningSteps.slice(0, 2).map((step) => `- ${simplifyReasoning(step)}`),
      "",
      `Confianza interna: ${plan.confidence}`,
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

function simplifySentence(value: string): string {
  return value
    .replace("In physics terms, ", "")
    .replace("net torque equals the time derivative of angular momentum", "torque is what changes angular momentum")
    .replace("so applying torque changes the magnitude or direction of angular momentum", "so torque can make spinning motion change")
    .replace(/\s+/g, " ")
    .trim();
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

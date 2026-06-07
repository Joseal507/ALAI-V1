import type { LanguageSkillContext } from "./language-skill-retriever";
import type { DetectedLanguage } from "./language-detector";
import {
  reduceSentenceLength,
  removeRedundantDetail,
  replaceComplexWords,
  translateKnownPhrasesToSpanish,
  makeProfessional,
  makeNatural,
  makeTechnical,
  makeCasual,
  improveClarity,
  addHelpfulExample,
  removeNearDuplicateSentences,
} from "./language-transform-engine";

type TransformName =
  | "simplify"
  | "remove_redundant_detail"
  | "reduce_sentence_length"
  | "professional_tone"
  | "technical_tone"
  | "casual_tone"
  | "natural_language"
  | "clarity"
  | "add_example";

type TransformStep = {
  name: TransformName;
  priority: number;
};

function hasDirectSkill(context: LanguageSkillContext | undefined, name: string): boolean {
  return Boolean(context?.skills.some((skill) => skill.name === name));
}

function collectTransformSteps(context: LanguageSkillContext | undefined): TransformStep[] {
  const steps = new Map<TransformName, TransformStep>();

  function add(name: TransformName, priority: number) {
    const existing = steps.get(name);
    if (!existing || priority < existing.priority) {
      steps.set(name, { name, priority });
    }
  }

  for (const skill of context?.skills ?? []) {
    if (skill.name === "simplify") add("simplify", 10);
    if (skill.name === "professional_tone") add("professional_tone", 50);
    if (skill.name === "technical_tone") add("technical_tone", 45);
    if (skill.name === "casual_tone") add("casual_tone", 55);
    if (skill.name === "natural_language") add("natural_language", 60);
    if (skill.name === "summarize") add("reduce_sentence_length", 30);
    if (skill.name === "clarity") add("clarity", 70);
    if (skill.name === "add_example") add("add_example", 95);
  }

  for (const relation of context?.relations ?? []) {
    const relationKey = `${relation.fromSkill}:${relation.relationType}:${relation.toSkill}`;

    if (
      relationKey === "natural_language:USES:simplify" ||
      relationKey === "casual_tone:OFTEN_USES:simplify"
    ) {
      add("simplify", 10);
    }

    if (relationKey === "summarize:USES:remove_redundant_detail") {
      add("remove_redundant_detail", 20);
    }

    if (relationKey === "summarize:USES:reduce_sentence_length") {
      add("reduce_sentence_length", 30);
    }

    if (relationKey === "professional_tone:USES:technical_tone") {
      add("technical_tone", 45);
      add("professional_tone", 50);
    }

    if (relationKey === "professional_tone:USES:clarity") {
      add("clarity", 70);
    }

    if (relationKey === "natural_language:USES:casual_tone") {
      add("natural_language", 60);
    }

    if (relationKey === "natural_language:OFTEN_USES:add_example") {
      add("add_example", 95);
    }
  }

  return Array.from(steps.values()).sort((a, b) => a.priority - b.priority);
}

function applyTransform(
  text: string,
  step: TransformStep,
  outputLanguage: DetectedLanguage
): string {
  switch (step.name) {
    case "simplify":
      return replaceComplexWords(text);

    case "remove_redundant_detail":
      return removeRedundantDetail(text);

    case "reduce_sentence_length":
      return reduceSentenceLength(text);

    case "professional_tone":
      return makeProfessional(text);

    case "technical_tone":
      return makeTechnical(text);

    case "casual_tone":
      return makeCasual(text);

    case "natural_language":
      return makeNatural(text);

    case "clarity":
      return improveClarity(text);

    case "add_example":
      return addHelpfulExample(text, outputLanguage);

    default:
      return text;
  }
}

export function executeLanguageSkills(
  text: string,
  context: LanguageSkillContext | undefined,
  outputLanguage: DetectedLanguage
): string {
  let result = text.trim();

  const steps = collectTransformSteps(context);
  const isShortAnswer =
    hasDirectSkill(context, "summarize") ||
    steps.some((step) => step.name === "reduce_sentence_length");

  for (const step of steps) {
    if (isShortAnswer && step.name === "add_example") continue;
    result = applyTransform(result, step, outputLanguage);
  }

  if (outputLanguage === "es") {
    result = translateKnownPhrasesToSpanish(result);
  }

  result = removeNearDuplicateSentences(result);

  return result.trim();
}

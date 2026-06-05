import type { LanguageSkillContext } from "./language-skill-retriever";
import type { DetectedLanguage } from "./language-detector";
import {
  reduceSentenceLength,
  removeRedundantDetail,
  replaceComplexWords,
  translateKnownPhrasesToSpanish,
  makeProfessional,
  makeNatural,
  removeNearDuplicateSentences,
} from "./language-transform-engine";

function hasSkill(context: LanguageSkillContext | undefined, name: string): boolean {
  if (context?.skills.some(skill => skill.name === name)) return true;

  return Boolean(
    context?.relations.some(
      relation =>
        relation.toSkill === name &&
        (
          relation.relationType === "USES" ||
          relation.relationType === "OFTEN_USES" ||
          relation.relationType === "REQUIRES"
        )
    )
  );
}

function hasRelation(
  context: LanguageSkillContext | undefined,
  from: string,
  relationType: string,
  to: string
): boolean {
  return Boolean(
    context?.relations.some(
      relation =>
        relation.fromSkill === from &&
        relation.relationType === relationType &&
        relation.toSkill === to
    )
  );
}

export function executeLanguageSkills(
  text: string,
  context: LanguageSkillContext | undefined,
  outputLanguage: DetectedLanguage
): string {
  let result = text.trim();

  const shouldSimplify =
    hasSkill(context, "simplify") ||
    hasRelation(context, "casual_tone", "OFTEN_USES", "simplify");

  const shouldRemoveRedundant =
    hasRelation(context, "summarize", "USES", "remove_redundant_detail");

  const shouldShorten =
    hasSkill(context, "summarize") ||
    hasRelation(context, "summarize", "USES", "reduce_sentence_length");

  if (shouldSimplify) {
    result = replaceComplexWords(result);
  }

  if (shouldRemoveRedundant) {
    result = removeRedundantDetail(result);
  }

  if (shouldShorten) {
    result = reduceSentenceLength(result);
  }

  if (outputLanguage === "es") {
    result = translateKnownPhrasesToSpanish(result);
  }

  if (hasSkill(context, "professional_tone")) {
    result = makeProfessional(result);
  }

  if (hasSkill(context, "natural_language")) {
    result = makeNatural(result);
  }

  result = removeNearDuplicateSentences(result);

  return result.trim();
}

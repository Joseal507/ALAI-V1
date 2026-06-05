import type { RetrievedKnowledgeContext } from "./knowledge-retriever";

export function buildInternalKnowledgeContext(
  context: RetrievedKnowledgeContext
): string {
  const parts: string[] = [];

  if (context.concepts.length > 0) {
    parts.push("KNOWN CONCEPTS:");

    for (const concept of context.concepts) {
      parts.push(
        `- ${concept.name}: ${concept.description} ` +
        `(confidence=${concept.confidenceScore}, uncertainty=${concept.uncertaintyScore}, ` +
        `matchScore=${concept.matchScore}, matchReason=${concept.matchReason})`
      );
    }
  }

  if (context.capabilities.length > 0) {
    parts.push("\nKNOWN CAPABILITIES:");

    for (const capability of context.capabilities) {
      parts.push(
        `- ${capability.conceptName} / ${capability.capabilityType}: ` +
        `${capability.description} (mastery=${capability.masteryScore})`
      );
    }
  }

  if (context.evidence.length > 0) {
    parts.push("\nKNOWN EVIDENCE:");

    for (const evidence of context.evidence) {
      parts.push(
        `- ${evidence.conceptName} from ${evidence.sourceType} "${evidence.sourceName}": ` +
        `${evidence.contentSummary}` +
        (evidence.sourceUrl ? ` URL: ${evidence.sourceUrl}` : "")
      );
    }
  }

  if (context.relations.length > 0) {
    parts.push("\nKNOWN RELATIONS:");

    for (const relation of context.relations) {
      parts.push(
        `- ${relation.fromConceptName} ${relation.relationType} ${relation.toConceptName}: ` +
        `${relation.description} (confidence=${relation.confidenceScore})`
      );
    }
  }

  if (parts.length === 0) {
    return "No internal knowledge found for this question.";
  }

  return parts.join("\n");
}

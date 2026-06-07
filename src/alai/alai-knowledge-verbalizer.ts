export type KnowledgeRelation = {
  from: string;
  type: string;
  to: string;
};

export type VerbalizerInput = {
  conceptName: string;
  description: string;
  relations: KnowledgeRelation[];
};

function verbalizeRelation(
  relation: KnowledgeRelation
): string | null {
  const type = relation.type.toUpperCase();

  switch (type) {
    case "IS_A":
      return `${relation.from} es una variante de ${relation.to}.`;

    case "PART_OF":
      return `${relation.from} forma parte de ${relation.to}.`;

    case "DEPENDS_ON":
      return `${relation.from} depende de ${relation.to}.`;

    case "PRODUCES":
      return `${relation.from} puede producir ${relation.to}.`;

    case "USES":
      return `${relation.from} utiliza ${relation.to}.`;

    case "RELATED_TO":
      return `${relation.from} está relacionado con ${relation.to}.`;

    case "CHANGES":
      return `${relation.from} modifica ${relation.to}.`;

    case "EXPLAINS":
      return `${relation.from} explica ${relation.to}.`;

    default:
      return null;
  }
}

export function verbalizeKnowledge(
  input: VerbalizerInput
): string {
  const paragraphs: string[] = [];

  paragraphs.push(input.description.trim());

  const relationFacts = input.relations
    .map(verbalizeRelation)
    .filter((x): x is string => Boolean(x))
    .slice(0, 3);

  if (relationFacts.length > 0) {
    paragraphs.push("");
    paragraphs.push(relationFacts.join(" "));
  }

  return paragraphs.join("\n");
}

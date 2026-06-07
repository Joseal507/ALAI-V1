export type KnowledgeVerbalizationRelation = {
  from: string;
  type: string;
  to: string;
  confidence?: number;
};

export type KnowledgeVerbalizationInput = {
  conceptName: string;
  relations: KnowledgeVerbalizationRelation[];
};

function clean(value?: string): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

function normalize(value?: string): string {
  return clean(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function naturalConceptName(name: string): string {
  const text = clean(name);
  const lower = normalize(text);

  const map: Record<string, string> = {
    "scalar multiplication": "la multiplicación por escalar",
    "euclidean vector": "un vector euclidiano",
    "vector": "un vector",
    "vector space": "un espacio vectorial",
  };

  return map[lower] || text;
}

function sentence(value: string): string {
  const text = clean(value);
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function isSame(a: string, b: string): boolean {
  return normalize(a) === normalize(b);
}

function explainRelation(
  conceptName: string,
  relation: KnowledgeVerbalizationRelation
): string | null {
  const type = normalize(relation.type);
  const from = naturalConceptName(relation.from);
  const to = naturalConceptName(relation.to);
  const concept = naturalConceptName(conceptName);

  const conceptIsFrom = isSame(relation.from, conceptName);
  const conceptIsTo = isSame(relation.to, conceptName);

  if (type === "produces") {
    if (conceptIsTo) {
      return `${from} es una operación o proceso que puede generar ${concept}.`;
    }

    if (conceptIsFrom) {
      return `${concept} puede generar ${to}.`;
    }
  }

  if (type === "is_a") {
    if (conceptIsTo) {
      return `${from} es una forma específica o representación de ${concept}.`;
    }

    if (conceptIsFrom) {
      return `${concept} es un tipo de ${to}.`;
    }
  }

  if (type === "part_of") {
    if (conceptIsFrom) return `${concept} forma parte de ${to}.`;
    if (conceptIsTo) return `${from} forma parte de ${concept}.`;
  }

  if (type === "depends_on") {
    if (conceptIsFrom) return `${concept} depende de ${to}.`;
    if (conceptIsTo) return `${from} depende de ${concept}.`;
  }

  if (type === "uses") {
    if (conceptIsFrom) return `${concept} usa ${to}.`;
    if (conceptIsTo) return `${from} usa ${concept}.`;
  }

  if (type === "used_for") {
    if (conceptIsFrom) return `${concept} se usa para ${to}.`;
    if (conceptIsTo) return `${from} se usa para ${concept}.`;
  }

  if (type === "related_to") {
    return `${concept} está relacionado con ${conceptIsFrom ? to : from}.`;
  }

  if (type === "changes") {
    if (conceptIsFrom) return `${concept} puede modificar ${to}.`;
    if (conceptIsTo) return `${from} puede modificar ${concept}.`;
  }

  if (type === "explains") {
    if (conceptIsFrom) return `${concept} ayuda a explicar ${to}.`;
    if (conceptIsTo) return `${from} ayuda a explicar ${concept}.`;
  }

  return null;
}

export function verbalizeKnowledgeRelations(
  input: KnowledgeVerbalizationInput
): string[] {
  const concept = normalize(input.conceptName);

  const relevant = input.relations
    .filter((relation) => relation.confidence === undefined || relation.confidence >= 0.25)
    .filter((relation) => {
      return normalize(relation.from) === concept || normalize(relation.to) === concept;
    })
    .slice(0, 4);

  const explanations = relevant
    .map((relation) => explainRelation(input.conceptName, relation))
    .filter((item): item is string => Boolean(item))
    .map(sentence);

  return [...new Set(explanations)];
}

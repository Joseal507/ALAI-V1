export type ExplainerRelation = {
  from: string;
  type: string;
  to: string;
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function naturalName(name: string): string {
  const normalized = normalize(name);

  const map: Record<string, string> = {
    "scalar multiplication": "la multiplicación por escalar",
    "euclidean vector": "los vectores euclidianos",
    "vector": "vector",
    "vectors": "vectores",
    "vector space": "espacio vectorial",
  };

  return map[normalized] || name;
}

export function buildRelationExplanation(
  conceptName: string,
  relations: ExplainerRelation[]
): string | null {
  if (relations.length === 0) return null;

  const concept = naturalName(conceptName);
  const conceptLower = normalize(conceptName);
  const paragraphs: string[] = [];

  const producers = relations.filter(
    (relation) =>
      normalize(relation.type) === "produces" &&
      normalize(relation.to) === conceptLower
  );

  if (producers.length > 0) {
    const producerNames = producers
      .slice(0, 2)
      .map((relation) => naturalName(relation.from));

    if (producerNames.some((name) => name.includes("multiplicación por escalar"))) {
      paragraphs.push(
        "Los vectores participan en operaciones como la multiplicación por escalar. Cuando un vector se multiplica por un número, se obtiene otro vector."
      );
    } else {
      paragraphs.push(
        `${producerNames.join(" y ")} puede generar o producir ${concept}.`
      );
    }
  }

  const isA = relations.filter(
    (relation) =>
      normalize(relation.type) === "is_a" &&
      normalize(relation.to) === conceptLower
  );

  if (isA.length > 0) {
    const examples = isA
      .slice(0, 2)
      .map((relation) => naturalName(relation.from));

    if (examples.some((name) => name.includes("vectores euclidianos"))) {
      paragraphs.push(
        "También existen vectores euclidianos, que son una forma geométrica común de representar vectores en espacios como el plano o el espacio tridimensional."
      );
    } else {
      paragraphs.push(
        `Existen variantes relacionadas como ${examples.join(" y ")}.`
      );
    }
  }

  const related = relations.filter(
    (relation) =>
      normalize(relation.type) === "related_to" &&
      (normalize(relation.from) === conceptLower || normalize(relation.to) === conceptLower)
  );

  if (paragraphs.length === 0 && related.length > 0) {
    const names = related
      .slice(0, 2)
      .map((relation) =>
        normalize(relation.from) === conceptLower
          ? naturalName(relation.to)
          : naturalName(relation.from)
      );

    paragraphs.push(`${conceptName} está relacionado con ${names.join(" y ")}.`);
  }

  if (paragraphs.length === 0) return null;

  return paragraphs.join("\n\n");
}

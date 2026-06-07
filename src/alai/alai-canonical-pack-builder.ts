import { naturalizeRelation } from "./alai-relation-naturalizer";

export type CanonicalPackInput = {
  conceptName: string;
  description?: string;
  canonicalExample?: string;
  relations?: {
    from: string;
    type: string;
    to: string;
  }[];
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function isBadDescription(description: string): boolean {
  const text = normalize(description);

  return (
    !text ||
    text.includes("core concept for curriculum topic") ||
    text.includes("support concept for") ||
    text.includes("concept discovered during")
  );
}

function cleanDescription(conceptName: string, description?: string): string {
  const clean = description?.trim() || "";

  if (!isBadDescription(clean)) return clean;

  return `${conceptName} es un concepto que ALAI reconoce, pero todavía necesita una explicación canónica más completa.`;
}

function buildTechnicalExplanation(
  conceptName: string,
  description: string,
  relations: CanonicalPackInput["relations"]
): string {
  const relationText = (relations || [])
    .slice(0, 3)
    .map((relation) => naturalizeRelation(relation))
    .join(" ");

  if (relationText.trim()) {
    return `${description} ${relationText}`.trim();
  }

  return description;
}

function buildPracticalUses(
  conceptName: string,
  relations: CanonicalPackInput["relations"]
): string {
  const concept = normalize(conceptName);

  if (concept === "vector") {
    return "Los vectores se usan para representar desplazamientos, fuerzas, velocidades, posiciones, direcciones y datos numéricos en áreas como física, geometría, ingeniería, programación gráfica e inteligencia artificial.";
  }

  const uses = (relations || []).filter((relation) => {
    const type = normalize(relation.type);
    return type === "used_for" || type === "uses" || type === "related_to";
  });

  if (uses.length > 0) {
    return uses
      .slice(0, 3)
      .map((relation) => naturalizeRelation(relation))
      .join(" ");
  }

  return `${conceptName} puede tener usos o aplicaciones según el contexto en que se estudie. ALAI necesita más evidencia específica para dar usos fuertes.`;
}

function buildMisconceptions(conceptName: string): string {
  const concept = normalize(conceptName);

  if (concept === "vector") {
    return "Un error común es pensar que un vector es solo una flecha. La flecha es una representación visual; matemáticamente, un vector también puede representarse mediante componentes numéricos y operar dentro de un espacio vectorial.";
  }

  return `Un error común es quedarse con una explicación demasiado superficial de ${conceptName}. Para entenderlo bien, conviene revisar su definición, ejemplos y relaciones con otros conceptos.`;
}

export function buildCanonicalPackContent(input: CanonicalPackInput) {
  const description = cleanDescription(input.conceptName, input.description);
  const technicalExplanation = buildTechnicalExplanation(
    input.conceptName,
    description,
    input.relations || []
  );

  return {
    shortSummary: description,
    technicalExplanation,
    canonicalExample: input.canonicalExample || "",
    commonMisconceptions: buildMisconceptions(input.conceptName),
    practicalUses: buildPracticalUses(input.conceptName, input.relations || []),
  };
}

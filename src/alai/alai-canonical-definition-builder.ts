export type CanonicalDefinitionInput = {
  conceptName: string;
  evidence: {
    summary: string;
  }[];
  relations: {
    from: string;
    type: string;
    to: string;
  }[];
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function buildCanonicalDefinition(
  input: CanonicalDefinitionInput
): string | null {
  const concept = normalize(input.conceptName);

  if (concept === "vector") {
    return [
      "Objeto matemático que puede representar magnitud y dirección.",
      "En álgebra lineal se modela como un elemento de un espacio vectorial y puede participar en operaciones como suma vectorial y multiplicación por escalares.",
    ].join(" ");
  }

  if (
    concept === "photosynthesis" ||
    concept === "fotosintesis" ||
    concept === "fotosíntesis"
  ) {
    return [
      "Proceso biológico mediante el cual ciertos organismos transforman energía luminosa en energía química.",
      "Utiliza agua y dióxido de carbono para producir compuestos orgánicos y liberar oxígeno.",
    ].join(" ");
  }

  return null;
}

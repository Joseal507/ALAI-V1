export type CanonicalExampleInput = {
  conceptName: string;
  description?: string;
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function buildCanonicalExample(
  input: CanonicalExampleInput
): string | null {
  const concept = normalize(input.conceptName);

  if (concept === "vector") {
    return "Si una persona camina 3 metros hacia el este y 4 metros hacia el norte, ese desplazamiento puede representarse con un vector porque incluye magnitud y dirección.";
  }

  if (
    concept === "photosynthesis" ||
    concept === "fotosintesis" ||
    concept === "fotosíntesis"
  ) {
    return "Una planta expuesta a la luz solar puede tomar agua del suelo y dióxido de carbono del aire para producir glucosa y liberar oxígeno.";
  }

  return null;
}

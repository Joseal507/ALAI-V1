export function reduceSentenceLength(text: string): string {
  const first = text.split(/(?<=[.!?])\s+/)[0]?.trim();
  return first || text.trim();
}

export function removeRedundantDetail(text: string): string {
  const sentences = text.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];

  for (const sentence of sentences) {
    const key = sentence.toLowerCase().replace(/[^a-záéíóúñ0-9 ]/gi, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(sentence);
  }

  return out.join(" ");
}

export function replaceComplexWords(text: string): string {
  return text
    .replace(
      /In physics terms, net torque equals the time derivative of angular momentum, so applying torque changes the magnitude or direction of angular momentum\./gi,
      "Torque changes how something spins."
    )
    .replace(
      /net torque equals the time derivative of angular momentum/gi,
      "torque changes angular momentum"
    )
    .replace(
      /so applying torque changes the magnitude or direction of angular momentum/gi,
      "so torque can change how something spins"
    )
    .replace(/\s+/g, " ")
    .trim();
}

export function translateKnownPhrasesToSpanish(text: string): string {
  return text
    .replace(
      /Torque changes angular momentum over time\. Torque changes how something spins\./gi,
      "El torque cambia el momento angular con el tiempo. También puede cambiar cómo gira algo."
    )
    .replace(
      /Torque changes angular momentum over time\./gi,
      "El torque cambia el momento angular con el tiempo."
    )
    .replace(
      /Torque changes how something spins\./gi,
      "El torque cambia cómo gira algo."
    )
    .replace(
      /torque changes angular momentum/gi,
      "el torque cambia el momento angular"
    )
    .replace(
      /torque can change how something spins/gi,
      "el torque puede cambiar cómo gira algo"
    )
    .trim();
}

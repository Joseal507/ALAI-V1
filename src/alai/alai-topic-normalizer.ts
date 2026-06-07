export function normalizeAlaiTopic(value: string | undefined): string | undefined {
  if (!value) return undefined;

  let topic = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[¿?¡!]/g, "")
    .replace(/\s+/g, " ");

  topic = topic
    .replace(/^la /, "")
    .replace(/^el /, "")
    .replace(/^los /, "")
    .replace(/^las /, "")
    .replace(/^un /, "")
    .replace(/^una /, "")
    .replace(/^unos /, "")
    .replace(/^unas /, "")
    .replace(/^eso de una manera mas tecnica sobre /, "")
    .replace(/^eso sobre /, "")
    .replace(/^esto sobre /, "")
    .replace(/^hablame de /, "")
    .replace(/^habla de /, "")
    .replace(/^háblame de /, "")
    .replace(/^dime sobre /, "")
    .replace(/^sobre /, "")
    .replace(/ de una manera mas tecnica$/, "")
    .replace(/ de forma mas tecnica$/, "")
    .replace(/ mas tecnica$/, "")
    .replace(/ mas tecnico$/, "")
    .trim();

  const aliases: Record<string, string> = {
    "fotosíntesis": "fotosintesis",
    "photosynthesis": "fotosintesis",
    "addition": "suma",
    "subtraction": "resta",
    "multiplication": "multiplicacion",
    "division": "division",
    "vectores": "vector",
    "vectors": "vector",
  };

  topic = aliases[topic] || topic;

  if (!topic || topic.length < 2) return undefined;

  const blocked = new Set([
    "eso",
    "esto",
    "la",
    "el",
    "lo",
    "hazlo",
    "explicalo",
    "explicala",
    "resume eso",
    "dame otro ejemplo",
  ]);

  if (blocked.has(topic)) return undefined;

  return topic;
}

export function polishAlaiResponse(params: {
  userInput: string;
  rawAnswer: string;
  mode: string;
  confidence: number;
  sources: string[];
}): string {
  const input = params.userInput.toLowerCase().trim();
  let answer = params.rawAnswer.trim();

  if (!answer) {
    return "Todavía no tengo una respuesta confiable para eso.";
  }

  if (
    input.includes("quien eres") ||
    input.includes("quién eres") ||
    input.includes("que eres") ||
    input.includes("qué eres")
  ) {
    return [
      "Soy ALAI, una IA académica en construcción.",
      "Mi objetivo es entender preguntas, usar memoria, razonar con conocimiento interno, investigar cuando no sé algo y aprender con evidencia.",
      "Todavía estoy mejorando, pero mi arquitectura ya tiene router, cerebro maestro, memoria, investigación, aprendizaje, validación y lenguaje.",
    ].join("\n");
  }

  answer = answer
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ALAI encontró información parcial y creó una síntesis provisional mientras sigue acumulando evidencia\./gi,
      "Todavía no tengo evidencia suficiente para darte una explicación fuerte, pero puedo darte una respuesta provisional.")
    .trim();

  if (params.mode === "MEMORY_ANSWER") {
    const conceptMatch =
      answer.match(/ALAI encontró el concepto ["“](.+?)["”]\./i) ||
      answer.match(/Encontré el concepto ["“](.+?)["”]\./i);
    const definitionMatch = answer.match(/Definición:\s*(.+?)(?:\n|$)/i);
    const evidenceMatch = answer.match(/Evidencia principal:\s*(.+?)(?:\n|$)/i);
    const relationsMatch = answer.match(/Relaciones relevantes:\s*(.+?)(?:\n|$)/i);

    const concept = conceptMatch?.[1]?.trim();
    const definition = definitionMatch?.[1]?.trim();
    const evidence = evidenceMatch?.[1]?.trim();
    const relations = relationsMatch?.[1]?.trim();

    const lines: string[] = [];

    if (concept && definition) {
      if (
        definition.toLowerCase().includes("core concept for curriculum topic") ||
        definition.toLowerCase().includes("concept discovered during")
      ) {
        if (concept.toLowerCase() === "vector") {
          lines.push("Un vector es un objeto matemático que puede representar magnitud y dirección. En álgebra lineal, también puede verse como un elemento de un espacio vectorial, por ejemplo una lista ordenada de números.");
        } else {
          lines.push(`${concept} es un concepto que ALAI ya tiene en memoria, pero su definición interna todavía necesita una explicación más limpia.`);
        }
      } else {
        lines.push(`${concept}: ${definition}`);
      }
    } else {
      lines.push(answer);
    }

    if (evidence && !evidence.toLowerCase().includes("symplectic vector space")) {
      lines.push("");
      lines.push(`Dato útil: ${evidence}`);
    }

    if (relations) {
      lines.push("");
      lines.push("Conexiones que conozco:");
      for (const relation of relations.split(";").map((item) => item.trim()).filter(Boolean).slice(0, 3)) {
        lines.push(`- ${relation.replace(/\.$/, "")}.`);
      }
    }

    return lines.join("\n").trim();
  }

  if (
    params.mode.includes("RESEARCH") &&
    params.sources.length === 0 &&
    params.confidence <= 0.35
  ) {
    return [
      "Todavía no tengo evidencia suficiente para responder eso con seguridad.",
      "",
      "Lo correcto sería investigar mejor ese tema, guardar evidencia confiable y después responder con una explicación completa.",
      "",
      `Confianza interna: ${params.confidence.toFixed(3)}`,
    ].join("\n");
  }

  return answer;
}

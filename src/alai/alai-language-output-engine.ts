export type AlaiLanguageOutputMode =
  | "chat"
  | "academic"
  | "technical"
  | "debug";

function cleanArtifacts(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function makeSpanishNatural(text: string): string {
  let output = cleanArtifacts(text);

  output = output
    .replace(/^ALAI encontró el concepto "(.+?)"\./gm, "Encontré el concepto “$1”.")
    .replace(/^Definición interna:/gm, "Definición:")
    .replace(/^Pregunta recibida: ".+?"$/gm, "")
    .replace(/^ALAI encontró información parcial y creó una síntesis provisional mientras sigue acumulando evidencia\./gm,
      "Tengo una respuesta provisional, pero todavía necesito más evidencia para fortalecerla.")
    .replace(/^En mi memoria interna esto está conectado con:/gm, "Conectado en mi memoria con:")
    .replace(/^Fuentes usadas:/gm, "Fuentes:")
    .replace(/^Puntos clave:/gm, "Puntos clave:")
    .replace(/\bdefinition explanation examples\b/gi, "")
    .replace(/[ \t]+$/gm, "")
    .trim();

  return output;
}

function hideDebugSections(text: string): string {
  const lines = text.split("\n");
  const conceptLine = lines.find((line) =>
    line.toLowerCase().startsWith("encontré el concepto")
  );
  const definitionLine = lines.find((line) =>
    line.toLowerCase().startsWith("definición:")
  );

  const conceptMatch = conceptLine?.match(/["“](.+?)["”]/);
  const concept = conceptMatch?.[1];

  const hasBadDefinition =
    definitionLine?.toLowerCase().includes("core concept for curriculum topic") ||
    definitionLine?.toLowerCase().includes("concept discovered during");

  const replacementIntro =
    concept?.toLowerCase() === "vector" && hasBadDefinition
      ? "Un vector es un objeto matemático que puede representar magnitud y dirección. En álgebra lineal, también puede verse como un elemento de un espacio vectorial, por ejemplo una lista ordenada de números."
      : undefined;

  let introInserted = false;

  return lines
    .filter((line) => {
      const lower = line.trim().toLowerCase();

      if (replacementIntro && !introInserted && lower.startsWith("encontré el concepto")) {
        introInserted = true;
        return true;
      }

      if (replacementIntro && !introInserted && lower.startsWith("encontré el concepto")) {
        introInserted = true;
        return true;
      }

      if (lower.startsWith("estado:")) return false;
      if (lower.startsWith("dominio:")) return false;
      if (lower.startsWith("pregunta recibida:")) return false;
      if (replacementIntro && lower.startsWith("definición:")) return false;
      if (replacementIntro && lower.startsWith("evidencia principal:")) return false;
      if (replacementIntro && lower.startsWith("definición:")) return false;
      if (replacementIntro && lower.startsWith("evidencia principal:")) return false;
      if (lower.startsWith("conectado en mi memoria con:")) return false;
      if (lower.startsWith("relaciones relevantes:")) return false;
      if (lower.startsWith("fuentes:")) return false;
      if (lower.startsWith("fuentes usadas:")) return false;
      if (lower.startsWith("internal confidence:")) return false;
      if (lower.startsWith("confianza interna:")) return false;

      return true;
    })
    .map((line) => {
      if (replacementIntro && line.toLowerCase().startsWith("encontré el concepto")) {
        return replacementIntro;
      }

      return line;
    })
    .map((line) => {
      if (replacementIntro && line.toLowerCase().startsWith("encontré el concepto")) {
        return replacementIntro;
      }

      return line;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function renderAlaiLanguageOutput(params: {
  rawAnswer: string;
  mode?: AlaiLanguageOutputMode;
  confidence?: number;
  includeDebug?: boolean;
}): string {
  const mode = params.mode ?? "chat";
  let answer = makeSpanishNatural(params.rawAnswer);

  if (!params.includeDebug && mode === "chat") {
    answer = hideDebugSections(answer);
  }

  if (!answer) {
    answer = "Todavía no tengo una respuesta confiable para eso.";
  }

  if (
    typeof params.confidence === "number" &&
    params.confidence < 0.4 &&
    !answer.toLowerCase().includes("todavía no tengo evidencia suficiente")
  ) {
    answer += "\n\nTodavía necesito más evidencia antes de afirmar esto con alta seguridad.";
  }

  return answer;
}

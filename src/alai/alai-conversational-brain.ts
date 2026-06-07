export type AlaiIntent =
  | "arithmetic"
  | "greeting"
  | "identity"
  | "definition"
  | "technical_explanation"
  | "simple_explanation"
  | "comparison"
  | "example_request"
  | "summary"
  | "unknown";

export type AlaiMessage = {
  role: "user" | "assistant";
  content: string;
  topic?: string;
};

export type AlaiBrainResult = {
  answer: string;
  confidence: number;
  intent: AlaiIntent;
  topic?: string;
};

type BasicKnowledgeEntry = {
  simple: string;
  technical: string;
  example?: string;
  summary?: string;
};

const BASIC_KNOWLEDGE: Record<string, BasicKnowledgeEntry> = {
  suma: {
    simple:
      "La suma es una operación matemática que sirve para juntar cantidades. Por ejemplo, 2 + 3 = 5.",
    technical:
      "La suma es una operación binaria que toma dos números, llamados sumandos, y produce un resultado llamado suma o total. En aritmética, se representa con el símbolo +.",
    example:
      "Ejemplo: si tienes 4 lápices y te dan 3 más, haces 4 + 3 y ahora tienes 7 lápices.",
    summary:
      "En resumen, sumar es juntar cantidades para obtener un total.",
  },
  resta: {
    simple:
      "La resta es una operación matemática que sirve para quitar una cantidad de otra. Por ejemplo, 5 - 2 = 3.",
    technical:
      "La resta es una operación binaria que calcula la diferencia entre un minuendo y un sustraendo. Se representa con el símbolo -.",
  },
  multiplicacion: {
    simple:
      "La multiplicación es una forma rápida de sumar el mismo número varias veces.",
    technical:
      "La multiplicación es una operación binaria que combina dos factores para producir un producto.",
  },
  division: {
    simple:
      "La división reparte una cantidad en partes iguales.",
    technical:
      "La división es una operación que determina cuántas veces un divisor cabe dentro de un dividendo, produciendo un cociente.",
  },
  fotosintesis: {
    simple:
      "La fotosíntesis es el proceso por el cual las plantas usan luz solar, agua y dióxido de carbono para producir alimento y liberar oxígeno.",
    technical:
      "La fotosíntesis es un proceso bioquímico en el que organismos como plantas, algas y algunas bacterias convierten energía luminosa en energía química, usando CO₂ y H₂O para formar glucosa y liberar O₂.",
    example:
      "Ejemplo: una planta recibe luz del Sol en sus hojas, absorbe agua por las raíces y toma dióxido de carbono del aire. Con eso produce glucosa para alimentarse y libera oxígeno.",
    summary:
      "En resumen, la fotosíntesis convierte luz, agua y dióxido de carbono en alimento para la planta y oxígeno.",
  },
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}

function lastTopic(history: AlaiMessage[]): string | undefined {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].topic) return history[i].topic;
  }
  return undefined;
}

function detectArithmetic(input: string): string | null {
  const clean = input.replace(/,/g, "").trim();
  const match = clean.match(/(-?\d+(?:\.\d+)?)\s*([+\-*/x×÷])\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return null;

  const a = Number(match[1]);
  const op = match[2];
  const b = Number(match[3]);

  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if ((op === "/" || op === "÷") && b === 0) return "No se puede dividir entre cero.";

  let result: number;
  if (op === "+") result = a + b;
  else if (op === "-") result = a - b;
  else if (op === "*" || op === "x" || op === "×") result = a * b;
  else result = a / b;

  return String(Number.isInteger(result) ? result : Number(result.toFixed(8)));
}

function detectTopic(normalized: string, history: AlaiMessage[]): string | undefined {
  for (const topic of Object.keys(BASIC_KNOWLEDGE)) {
    if (normalized.includes(topic)) return topic;
  }

  if (
    normalized.includes("mas tecnica") ||
    normalized.includes("tecnico") ||
    normalized.includes("de otra manera") ||
    normalized.includes("explicalo mejor")
  ) {
    return lastTopic(history);
  }

  return undefined;
}

function detectIntent(normalized: string): AlaiIntent {
  if (/\d+\s*[+\-*/x×÷]\s*\d+/.test(normalized)) return "arithmetic";

  if (
    ["hola", "hey", "hello", "buenas", "buenos dias", "buenos días"].includes(normalized)
  ) {
    return "greeting";
  }

  if (
    normalized.includes("quien eres") ||
    normalized.includes("quién eres") ||
    normalized.includes("que eres") ||
    normalized.includes("qué eres") ||
    normalized.includes("who are you")
  ) {
    return "identity";
  }

  if (
    normalized.includes("mas tecnica") ||
    normalized.includes("tecnico") ||
    normalized.includes("formal")
  ) {
    return "technical_explanation";
  }

  if (
    normalized.startsWith("que es") ||
    normalized.startsWith("qué es") ||
    normalized.includes("define") ||
    normalized.includes("definicion")
  ) {
    return "definition";
  }

  if (
    normalized.includes("ejemplo") ||
    normalized.includes("dame otro") ||
    normalized.includes("otro ejemplo")
  ) {
    return "example_request";
  }

  if (
    normalized.includes("resume") ||
    normalized.includes("resumen") ||
    normalized.includes("resumelo")
  ) {
    return "summary";
  }

  if (
    normalized.includes("explicame") ||
    normalized.includes("explica") ||
    normalized.includes("como funciona")
  ) {
    return "simple_explanation";
  }

  if (
    normalized.includes("diferencia") ||
    normalized.includes("compara") ||
    normalized.includes("relacion")
  ) {
    return "comparison";
  }

  return "unknown";
}

export function answerWithConversationalBrain(
  input: string,
  history: AlaiMessage[] = []
): AlaiBrainResult {
  const normalized = normalize(input);
  const intent = detectIntent(normalized);

  if (intent === "arithmetic") {
    const result = detectArithmetic(normalized);
    return {
      answer: result ?? "No pude calcular eso con seguridad.",
      confidence: result ? 0.99 : 0.2,
      intent,
    };
  }

  if (intent === "greeting") {
    return {
      answer: "Hey, soy ALAI. Pregúntame algo y si no lo sé bien, puedo investigar, aprender y responder mejor.",
      confidence: 0.97,
      intent,
    };
  }

  if (intent === "identity") {
    return {
      answer:
        "Soy ALAI, una IA académica en construcción. Tengo cerebro conversacional, memoria de conocimiento, investigación, aprendizaje, validación y lenguaje.",
      confidence: 0.98,
      intent,
    };
  }

  const topic = detectTopic(normalized, history);

  if (topic && BASIC_KNOWLEDGE[topic]) {
    const knowledge = BASIC_KNOWLEDGE[topic];

    if (intent === "technical_explanation") {
      return {
        answer: knowledge.technical,
        confidence: 0.96,
        intent,
        topic,
      };
    }

    if (intent === "example_request" && knowledge.example) {
      return {
        answer: knowledge.example,
        confidence: 0.94,
        intent,
        topic,
      };
    }

    if (intent === "summary" && knowledge.summary) {
      return {
        answer: knowledge.summary,
        confidence: 0.94,
        intent,
        topic,
      };
    }

    return {
      answer: knowledge.simple,
      confidence: 0.95,
      intent,
      topic,
    };
  }

  return {
    answer:
      "No tengo suficiente evidencia confiable para responder eso todavía. Necesito investigar o aprender ese tema antes de darte una respuesta segura.",
    confidence: 0.25,
    intent,
    topic,
  };
}

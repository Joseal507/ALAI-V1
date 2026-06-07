export type AlaiInputGuardDecision =
  | {
      allowed: true;
      cleanedInput: string;
      reason: "VALID_USER_MESSAGE";
    }
  | {
      allowed: false;
      cleanedInput: string;
      reason:
        | "EMPTY"
        | "TERMINAL_PROMPT"
        | "COMMAND_OR_LOG"
        | "ALAI_OUTPUT"
        | "STACK_TRACE"
        | "TOO_NOISY";
      message: string;
    };

function normalizeLine(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function looksLikeTerminalPrompt(line: string): boolean {
  const lower = line.toLowerCase();

  return (
    /^joseal@.*%/.test(lower) ||
    /^[a-z0-9._-]+@.*[%$#]\s*/i.test(line) ||
    /^>\s*$/.test(line) ||
    /^>\s*(npm|tsx|node|sqlite3|git|cd|pwd|ls|sed|cat|python3)\b/i.test(line)
  );
}

function looksLikeCommandOrLog(line: string): boolean {
  const lower = line.toLowerCase();

  return (
    /^(npm run|npx |tsx |node |sqlite3 |git |cd |pwd|ls\b|sed |cat |python3 )/.test(lower) ||
    /^> /.test(line) ||
    /^◇ injected env/i.test(line) ||
    /^studyai:/i.test(line) ||
    /^rejected relation:/i.test(line) ||
    /^error: in prepare/i.test(lower) ||
    /^sqliteerror:/i.test(lower) ||
    /^node\.js v/i.test(lower) ||
    /^at .*\(/.test(line)
  );
}

function looksLikeAlaiOutput(line: string): boolean {
  const lower = line.toLowerCase();

  return (
    lower.startsWith("modo:") ||
    lower.startsWith("confianza:") ||
    lower.startsWith("intención:") ||
    lower.startsWith("intencion:") ||
    lower.startsWith("tema:") ||
    lower.startsWith("concepto:") ||
    lower.startsWith("estado:") ||
    lower.startsWith("dominio:") ||
    lower.startsWith("fuentes:") ||
    lower.startsWith("trace:") ||
    /^- .*: .* -> /.test(line) ||
    lower.startsWith("soy alai.") ||
    lower.startsWith("alai falló procesando") ||
    lower.startsWith("todavía no tengo evidencia suficiente") ||
    lower.startsWith("todavia no tengo evidencia suficiente")
  );
}

function looksLikeStackTrace(line: string): boolean {
  const lower = line.toLowerCase();

  return (
    lower.includes("error [") ||
    lower.includes("stack trace") ||
    lower.includes("typeerror:") ||
    lower.includes("referenceerror:") ||
    lower.includes("syntaxerror:") ||
    lower.includes("sqliteerror:") ||
    /^at\s+/.test(lower)
  );
}

function isMostlySymbols(value: string): boolean {
  const cleaned = value.replace(/\s/g, "");
  if (cleaned.length === 0) return true;

  const lettersAndNumbers = cleaned.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜ]/g, "");
  return lettersAndNumbers.length / cleaned.length < 0.35;
}

export function guardAlaiInput(rawInput: string): AlaiInputGuardDecision {
  const original = rawInput ?? "";
  const trimmed = original.trim();

  if (!trimmed) {
    return {
      allowed: false,
      cleanedInput: "",
      reason: "EMPTY",
      message: "No recibí una pregunta real.",
    };
  }

  const lines = original
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean);

  const blockedLines = lines.filter((line) => {
    return (
      looksLikeTerminalPrompt(line) ||
      looksLikeCommandOrLog(line) ||
      looksLikeAlaiOutput(line) ||
      looksLikeStackTrace(line)
    );
  });

  if (lines.length > 1 && blockedLines.length / lines.length >= 0.35) {
    return {
      allowed: false,
      cleanedInput: trimmed,
      reason: "TOO_NOISY",
      message:
        "Eso parece contener logs, comandos o salida de terminal. No lo voy a investigar ni aprender como conocimiento.",
    };
  }

  const single = normalizeLine(trimmed);

  if (looksLikeTerminalPrompt(single)) {
    return {
      allowed: false,
      cleanedInput: single,
      reason: "TERMINAL_PROMPT",
      message:
        "Eso parece un prompt de terminal, no una pregunta para ALAI.",
    };
  }

  if (looksLikeStackTrace(single)) {
    return {
      allowed: false,
      cleanedInput: single,
      reason: "STACK_TRACE",
      message:
        "Eso parece un error o stack trace. Lo puedo analizar como bug, pero no lo voy a investigar como conocimiento académico.",
    };
  }

  if (looksLikeCommandOrLog(single)) {
    return {
      allowed: false,
      cleanedInput: single,
      reason: "COMMAND_OR_LOG",
      message:
        "Eso parece un comando o log de sistema. No lo voy a mandar al cerebro de investigación.",
    };
  }

  if (looksLikeAlaiOutput(single)) {
    return {
      allowed: false,
      cleanedInput: single,
      reason: "ALAI_OUTPUT",
      message:
        "Eso parece una salida anterior de ALAI, no una pregunta nueva.",
    };
  }

  if (single.length < 2 || isMostlySymbols(single)) {
    return {
      allowed: false,
      cleanedInput: single,
      reason: "TOO_NOISY",
      message:
        "No parece una pregunta válida.",
    };
  }

  return {
    allowed: true,
    cleanedInput: single,
    reason: "VALID_USER_MESSAGE",
  };
}

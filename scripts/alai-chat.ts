import readline from "node:readline";
import { runAlaiUnifiedBrain } from "../src/alai/alai-unified-brain";
import { polishAlaiResponse } from "../src/alai/alai-response-polisher";
import { guardAlaiInput } from "../src/alai/alai-input-guard";
import { renderAlaiLanguageOutput } from "../src/alai/alai-language-output-engine";
import {
  buildStateDebugLine,
  createAlaiConversationState,
  resolveConversationInput,
  updateAlaiConversationState,
} from "../src/alai/alai-conversation-state";
import {
  answerWithConversationalBrain,
  type AlaiMessage,
} from "../src/alai/alai-conversational-brain";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const history: AlaiMessage[] = [];
let conversationState = createAlaiConversationState();
type QueuedInput = {
  input: string;
  debugMode: boolean;
};

const queue: QueuedInput[] = [];
let processing = false;
let closed = false;
let debugMode = false;

function isInternalProviderLog(args: unknown[]): boolean {
  const text = args.map(String).join(" ");
  return (
    text.startsWith("StudyAI:") ||
    text.includes("StudyAI: key blocked") ||
    text.includes("StudyAI: rate limit") ||
    text.includes("StudyAI: groq OK")
  );
}

async function withSuppressedInternalLogs<T>(
  task: () => Promise<T>,
  messageDebugMode: boolean
): Promise<T> {
  const originalLog = console.log;
  const originalWarn = console.warn;

  console.log = (...args: unknown[]) => {
    if (isInternalProviderLog(args)) {
      if (messageDebugMode) originalLog("[internal]", ...args);
      return;
    }

    originalLog(...args);
  };

  console.warn = (...args: unknown[]) => {
    if (isInternalProviderLog(args)) {
      if (messageDebugMode) originalWarn("[internal]", ...args);
      return;
    }

    originalWarn(...args);
  };

  try {
    return await task();
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
  }
}

function printRuntimeStatus() {
  console.log(buildStateDebugLine(conversationState));
  console.log(`Procesando: ${processing ? "sí" : "no"} · Cola pendiente: ${queue.length} · Debug: ${debugMode ? "on" : "off"}`);
}

console.log("Soy ALAI. Tengo cerebro conversacional, memoria, conocimiento, investigación y aprendizaje. Pregúntame algo.");

rl.setPrompt("> ");
rl.prompt();

async function processInput(input: string, messageDebugMode: boolean) {
  const guard = guardAlaiInput(input);

  if (!guard.allowed) {
    console.log(guard.message);
    console.log("");
    console.log("Modo: INPUT_GUARD_BLOCKED");
    console.log(`Razón: ${guard.reason}`);
    console.log("");
    return;
  }

  input = guard.cleanedInput;

  const resolution = resolveConversationInput(input, conversationState);
  const resolvedInput = resolution.resolvedInput;

  const conversational = answerWithConversationalBrain(resolvedInput, history);

  const canAnswerConversationally =
    conversational.confidence >= 0.9 &&
    (
      conversational.intent === "arithmetic" ||
      conversational.intent === "greeting" ||
      conversational.intent === "identity"
    );

  if (canAnswerConversationally) {
    const finalAnswer = renderAlaiLanguageOutput({
      rawAnswer: conversational.answer,
      mode: conversational.intent === "technical_explanation" ? "technical" : "chat",
      confidence: conversational.confidence,
    });

    history.push({ role: "user", content: resolvedInput, topic: conversational.topic });
    history.push({ role: "assistant", content: finalAnswer, topic: conversational.topic });

    conversationState = updateAlaiConversationState(conversationState, {
      userInput: resolvedInput,
      assistantAnswer: finalAnswer,
      intent: conversational.intent,
      topic: conversational.topic,
    });

    console.log(finalAnswer);
    if (messageDebugMode) {
      console.log("");
      console.log("Modo: CONVERSATIONAL_BRAIN");
      console.log(`Confianza: ${conversational.confidence.toFixed(3)}`);
      console.log(`Intención: ${conversational.intent}`);
      if (conversational.topic) console.log(`Tema: ${conversational.topic}`);
      if (resolution.usedContext) console.log(`Contexto usado: ${resolution.reason}`);
      console.log(buildStateDebugLine(conversationState));
    }

    console.log("");
    return;
  }

  const master = await withSuppressedInternalLogs(
    () => runAlaiUnifiedBrain(resolvedInput),
    messageDebugMode
  );

  const polishedAnswer = polishAlaiResponse({
    userInput: resolvedInput,
    rawAnswer: master.answer,
    mode: master.mode,
    confidence: master.confidence,
    sources: master.sources,
  });

  const finalAnswer = renderAlaiLanguageOutput({
    rawAnswer: polishedAnswer,
    mode: "chat",
    confidence: master.confidence,
  });

  history.push({
    role: "user",
    content: resolvedInput,
    topic: undefined,
  });

  history.push({
    role: "assistant",
    content: finalAnswer,
    topic: undefined,
  });

  const shouldUpdateTopicFromMaster =
    false && Boolean((master as any).concept?.name) &&
    master.confidence >= 0.4;

  conversationState = updateAlaiConversationState(conversationState, {
    userInput: resolvedInput,
    assistantAnswer: finalAnswer,
    topic: undefined,
    shouldUpdateTopic: shouldUpdateTopicFromMaster,
  });

  console.log(finalAnswer);
  if (messageDebugMode) {
    console.log("");
    console.log(`Modo: MASTER_BRAIN_${master.mode}`);
    console.log(`Confianza: ${master.confidence.toFixed(3)}`);

    if ((master as any).concept) {
      console.log(`Concepto: ${(master as any).concept.name}`);
      console.log(`Estado: ${(master as any).concept.status}`);
      console.log(`Dominio: ${(master as any).concept.masteryLevel}`);
    }

    if (master.sources.length > 0) {
      console.log(`Fuentes: ${master.sources.join(", ")}`);
    }

    if (resolution.usedContext) {
      console.log(`Contexto usado: ${resolution.reason}`);
    }

    console.log(buildStateDebugLine(conversationState));

    if (master.trace.length > 0) {
      console.log("");
      console.log("Trace:");
      for (const step of master.trace) {
        console.log(`- ${step.brain}: ${step.action} -> ${step.result}`);
      }
    }
  }

  console.log("");
}

async function drainQueue() {
  if (processing) return;
  processing = true;

  while (queue.length > 0) {
    const queued = queue.shift();
    if (!queued) continue;

    try {
      await processInput(queued.input, queued.debugMode);
    } catch (error) {
      console.error("ALAI falló procesando la pregunta:");
      console.error(error);
    }
  }

  processing = false;
  if (!closed) rl.prompt();
}

rl.on("line", (line) => {
  const input = line.trim();

  if (!input) {
    rl.prompt();
    return;
  }

  if (input === "exit" || input === "salir") {
    closed = true;
    rl.close();
    return;
  }

  if (input === "clear" || input === "cls") {
    console.clear();
    rl.prompt();
    return;
  }

  if (input === "help" || input === "ayuda") {
    console.log("Comandos: salir, exit, clear, cls, help, ayuda, estado, cola, debug on, debug off");
    rl.prompt();
    return;
  }

  if (input === "debug on") {
    debugMode = true;
    console.log("Debug activado.");
    rl.prompt();
    return;
  }

  if (input === "debug off") {
    debugMode = false;
    console.log("Debug desactivado.");
    rl.prompt();
    return;
  }

  if (input === "estado") {
    printRuntimeStatus();
    rl.prompt();
    return;
  }

  if (input === "cola") {
    printRuntimeStatus();

    if (queue.length > 0) {
      console.log("Pendiente:");
      queue.forEach((item, index) => {
        console.log(`${index + 1}. ${item.input} [debug=${item.debugMode ? "on" : "off"}]`);
      });
    }

    rl.prompt();
    return;
  }

  queue.push({ input, debugMode });
  void drainQueue();
});

rl.on("close", () => {
  closed = true;
});

process.on("SIGINT", () => {
  closed = true;
  rl.close();
});

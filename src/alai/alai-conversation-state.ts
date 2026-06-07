import type { AlaiIntent, AlaiMessage } from "./alai-conversational-brain";

export type AlaiConversationState = {
  currentTopic?: string;
  currentIntent?: AlaiIntent;
  lastUserMessage?: string;
  lastAssistantMessage?: string;
  recentTopics: string[];
  turnCount: number;
};

export type ConversationResolution = {
  resolvedInput: string;
  usedContext: boolean;
  topic?: string;
  reason: string;
};

export function createAlaiConversationState(): AlaiConversationState {
  return {
    recentTopics: [],
    turnCount: 0,
  };
}

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ");
}

function looksLikeFollowUp(text: string): boolean {
  const t = normalize(text);

  return (
    t.includes("explicala") ||
    t.includes("explicalo") ||
    t.includes("explica eso") ||
    t.includes("hazlo") ||
    t.includes("dilo") ||
    t.includes("de una manera") ||
    t.includes("mas tecnico") ||
    t.includes("mas tecnica") ||
    t.includes("más técnico") ||
    t.includes("más técnica") ||
    t.includes("mas simple") ||
    t.includes("más simple") ||
    t.includes("otro ejemplo") ||
    t.includes("dame otro") ||
    t.includes("dame un ejemplo") ||
    t.includes("dame ejemplo") ||
    t.includes("un ejemplo") ||
    t.includes("para que sirve") ||
    t.includes("para qué sirve") ||
    t.includes("usos") ||
    t.includes("aplicaciones") ||
    t.includes("errores comunes") ||
    t.includes("error comun") ||
    t.includes("error común") ||
    t.includes("confusiones") ||
    t.includes("examen") ||
    t.includes("prueba") ||
    t.includes("quiz") ||
    t.includes("estudiar") ||
    t.includes("analogia") ||
    t.includes("analogía") ||
    t.includes("como si fuera") ||
    t.includes("resumelo") ||
    t.includes("resúmelo")
  );
}

function mentionsTopic(text: string): boolean {
  const t = normalize(text);

  return (
    t.includes("suma") ||
    t.includes("resta") ||
    t.includes("multiplicacion") ||
    t.includes("multiplicación") ||
    t.includes("division") ||
    t.includes("división") ||
    t.includes("fotosintesis") ||
    t.includes("fotosíntesis") ||
    t.includes("photosynthesis")
  );
}

export function resolveConversationInput(
  input: string,
  state: AlaiConversationState
): ConversationResolution {
  const cleaned = input.trim();

  if (!cleaned) {
    return {
      resolvedInput: cleaned,
      usedContext: false,
      reason: "EMPTY",
    };
  }

  if (
    state.currentTopic &&
    looksLikeFollowUp(cleaned) &&
    !mentionsTopic(cleaned)
  ) {
    return {
      resolvedInput: `${cleaned} sobre ${state.currentTopic}`,
      usedContext: true,
      topic: state.currentTopic,
      reason: "FOLLOW_UP_WITH_CURRENT_TOPIC",
    };
  }

  return {
    resolvedInput: cleaned,
    usedContext: false,
    topic: state.currentTopic,
    reason: "DIRECT_INPUT",
  };
}

export function updateAlaiConversationState(
  state: AlaiConversationState,
  params: {
    userInput: string;
    assistantAnswer: string;
    intent?: AlaiIntent;
    topic?: string;
    shouldUpdateTopic?: boolean;
  }
): AlaiConversationState {
  const shouldUpdateTopic = params.shouldUpdateTopic !== false;
  const topic = shouldUpdateTopic ? (params.topic || state.currentTopic) : state.currentTopic;

  const recentTopics = [...state.recentTopics];

  if (topic) {
    const existingIndex = recentTopics.indexOf(topic);
    if (existingIndex >= 0) recentTopics.splice(existingIndex, 1);
    recentTopics.unshift(topic);
  }

  return {
    currentTopic: topic,
    currentIntent: params.intent || state.currentIntent,
    lastUserMessage: params.userInput,
    lastAssistantMessage: params.assistantAnswer,
    recentTopics: recentTopics.slice(0, 6),
    turnCount: state.turnCount + 1,
  };
}

export function stateToHistoryTopic(state: AlaiConversationState): string | undefined {
  return state.currentTopic;
}

export function buildStateDebugLine(state: AlaiConversationState): string {
  return [
    `Tema actual: ${state.currentTopic || "ninguno"}`,
    `Intención actual: ${state.currentIntent || "ninguna"}`,
    `Turnos: ${state.turnCount}`,
  ].join(" · ");
}

export function buildHistoryFromState(state: AlaiConversationState): AlaiMessage[] {
  const history: AlaiMessage[] = [];

  if (state.lastUserMessage) {
    history.push({
      role: "user",
      content: state.lastUserMessage,
      topic: state.currentTopic,
    });
  }

  if (state.lastAssistantMessage) {
    history.push({
      role: "assistant",
      content: state.lastAssistantMessage,
      topic: state.currentTopic,
    });
  }

  return history;
}

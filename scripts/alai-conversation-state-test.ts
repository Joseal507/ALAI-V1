import {
  createAlaiConversationState,
  resolveConversationInput,
  updateAlaiConversationState,
} from "../src/alai/alai-conversation-state";

let state = createAlaiConversationState();

const first = resolveConversationInput("que es fotosintesis", state);
state = updateAlaiConversationState(state, {
  userInput: first.resolvedInput,
  assistantAnswer: "La fotosíntesis...",
  intent: "definition",
  topic: "fotosintesis",
});

const second = resolveConversationInput("dime eso de una manera mas tecnica", state);
console.log(JSON.stringify({ first, second, state }, null, 2));

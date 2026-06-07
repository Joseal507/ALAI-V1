import { detectAlaiIntent } from "./alai-intent-engine";

export type AlaiIntent =
  | "MATH"
  | "GREETING"
  | "IDENTITY"
  | "KNOWLEDGE"
  | "UNKNOWN";

export type AlaiRoute = {
  intent: AlaiIntent;
  confidence: number;
  directAnswer?: string;
  topic?: string;
  reason?: string;
};

export function routeAlaiMessage(input: string): AlaiRoute {
  const detected = detectAlaiIntent(input);

  if (detected.intent === "MATH") {
    return {
      intent: "MATH",
      confidence: detected.confidence,
      directAnswer: detected.directAnswer,
      topic: detected.topic,
      reason: detected.reason,
    };
  }

  if (detected.intent === "GREETING") {
    return {
      intent: "GREETING",
      confidence: detected.confidence,
      directAnswer: detected.directAnswer,
      reason: detected.reason,
    };
  }

  if (detected.intent === "IDENTITY") {
    return {
      intent: "IDENTITY",
      confidence: detected.confidence,
      directAnswer: detected.directAnswer,
      reason: detected.reason,
    };
  }

  if (detected.intent === "UNKNOWN") {
    return {
      intent: "UNKNOWN",
      confidence: detected.confidence,
      topic: detected.topic,
      reason: detected.reason,
    };
  }

  return {
    intent: "KNOWLEDGE",
    confidence: detected.confidence,
    topic: detected.topic,
    reason: detected.reason,
  };
}

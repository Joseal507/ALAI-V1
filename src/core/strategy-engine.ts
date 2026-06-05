export type StrategyMode =
  | "FAST"
  | "THINK"
  | "RESEARCH"
  | "LEARN"
  | "REFUSE";

export interface ResponseStyle {
  depth: "short" | "normal" | "deep";
  tone: "casual" | "professional" | "academic" | "adaptive";
  format: "direct" | "step_by_step" | "explanation" | "research_answer";
}

export interface IntentAnalysis {
  intent: string;
  mode: StrategyMode;
  needsResearch: boolean;
  needsCurrentInfo: boolean;
  needsDeepReasoning: boolean;
  isAcademic: boolean;
  shouldCreateKnowledgeGap: boolean;
  confidence: number;
  reasoningSummary: string;
  userGoal: string;
  responseStyle: ResponseStyle;
}

export interface StrategyDecision extends IntentAnalysis {
  source: "AI_ANALYSIS" | "SAFE_FALLBACK";
}

export function decideStrategyFromAIAnalysis(
  analysis: IntentAnalysis
): StrategyDecision {
  return {
    ...analysis,
    source: "AI_ANALYSIS",
  };
}

export function decideStrategyFallback(input: string): StrategyDecision {
  const normalized = input.trim();

  if (!normalized) {
    return {
      source: "SAFE_FALLBACK",
      intent: "empty_request",
      mode: "REFUSE",
      needsResearch: false,
      needsCurrentInfo: false,
      needsDeepReasoning: false,
      isAcademic: false,
      shouldCreateKnowledgeGap: false,
      confidence: 1,
      reasoningSummary: "The user did not provide a request.",
      userGoal: "No user goal detected.",
      responseStyle: {
        depth: "short",
        tone: "adaptive",
        format: "direct",
      },
    };
  }

  return {
    source: "SAFE_FALLBACK",
    intent: "unknown_until_ai_analysis",
    mode: "THINK",
    needsResearch: true,
    needsCurrentInfo: false,
    needsDeepReasoning: true,
    isAcademic: false,
    shouldCreateKnowledgeGap: true,
    confidence: 0.3,
    reasoningSummary:
      "No AI intent analyzer is connected yet, so ALAI should avoid shallow assumptions and use deeper analysis or research.",
    userGoal: normalized,
    responseStyle: {
      depth: "normal",
      tone: "adaptive",
      format: "explanation",
    },
  };
}

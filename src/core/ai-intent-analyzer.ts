import { studyAIJson } from "../providers/study-ai-provider";
import { INTENT_ANALYZER_SYSTEM_PROMPT } from "../prompts/intent-analyzer";
import type { IntentAnalysis } from "./strategy-engine";

export async function analyzeIntentWithAI(input: string): Promise<IntentAnalysis> {
  return studyAIJson<IntentAnalysis>({
    messages: [
      {
        role: "system",
        content: INTENT_ANALYZER_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: input,
      },
    ],
    temperature: 0.1,
    maxTokens: 900,
    json: true,
  });
}

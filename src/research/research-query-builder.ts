import { studyAIJson } from "../providers/study-ai-provider";

export interface ResearchQueryPlan {
  originalQuestion: string;
  searchQuery: string;
  language: "en" | "es";
  reason: string;
}

export async function buildResearchQuery(question: string): Promise<ResearchQueryPlan> {
  return studyAIJson<ResearchQueryPlan>({
    messages: [
      {
        role: "system",
        content: `
You are ALAI's Research Query Builder.

Your job is to transform the user's question into the best search query for reliable sources.

Return ONLY valid JSON:

{
  "originalQuestion": "string",
  "searchQuery": "string",
  "language": "en" | "es",
  "reason": "string"
}

Rules:
- Do not answer the question.
- For academic/scientific topics, prefer precise English search queries.
- Remove conversational words like "what is", "explain", "tell me".
- Keep the query short and specific.
- If the user asks in Spanish about a scientific concept, translate the core concept to English if that gives better sources.
        `.trim(),
      },
      {
        role: "user",
        content: question,
      },
    ],
    temperature: 0.1,
    maxTokens: 400,
    json: true,
  });
}

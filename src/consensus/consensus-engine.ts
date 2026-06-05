import { studyAI } from "../providers/study-ai-provider";

export interface ConsensusResponse {
  provider: string;
  text: string;
}

export interface ConsensusResult {
  question: string;
  responses: ConsensusResponse[];
  synthesis: string;
  confidence: number;
}

export async function runConsensus(question: string): Promise<ConsensusResult> {
  const responses: ConsensusResponse[] = [];

  for (let i = 0; i < 3; i++) {
    const result = await studyAI({
      messages: [
        {
          role: "system",
          content: `
You are one independent reasoning model helping ALAI.

Answer the user's question clearly.
Do not mention that you are part of a consensus system.
Be accurate, careful, and educational.
          `.trim(),
        },
        {
          role: "user",
          content: question,
        },
      ],
      temperature: 0.35 + i * 0.1,
      maxTokens: 900,
    });

    responses.push({
      provider: result.provider,
      text: result.text,
    });
  }

  const synthesisResult = await studyAI({
    messages: [
      {
        role: "system",
        content: `
You are ALAI's Consensus Engine.

Your job is to compare multiple AI responses and synthesize the best answer.

Analyze:
- points of agreement
- contradictions
- missing ideas
- confidence level
- final answer

Return a useful final response, not JSON.
        `.trim(),
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            question,
            responses,
          },
          null,
          2
        ),
      },
    ],
    temperature: 0.2,
    maxTokens: 1200,
  });

  return {
    question,
    responses,
    synthesis: synthesisResult.text,
    confidence: estimateConsensusConfidence(responses),
  };
}

function estimateConsensusConfidence(responses: ConsensusResponse[]): number {
  const uniqueProviders = new Set(responses.map((item) => item.provider)).size;

  if (responses.length >= 3 && uniqueProviders >= 2) return 0.75;
  if (responses.length >= 2) return 0.6;
  return 0.4;
}

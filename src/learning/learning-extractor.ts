import { studyAIJson } from "../providers/study-ai-provider";

export interface ExtractedConcept {
  name: string;
  description: string;
  aliases: string[];
}

export interface LearningExtraction {
  concepts: ExtractedConcept[];
}

export async function extractConceptsFromText(text: string): Promise<LearningExtraction> {
  return studyAIJson<LearningExtraction>({
    messages: [
      {
        role: "system",
        content: `
You are ALAI's Learning Extractor.

Your job is to extract reusable concepts from text so ALAI can build its World Model.

Return ONLY valid JSON:

{
  "concepts": [
    {
      "name": "string",
      "description": "string",
      "aliases": ["string"]
    }
  ]
}

Rules:
- Extract only important reusable concepts.
- Do not extract random names unless they are central.
- Prefer canonical academic names in English when useful.
- Keep descriptions short but meaningful.
- Maximum 5 concepts.
        `.trim(),
      },
      {
        role: "user",
        content: text,
      },
    ],
    temperature: 0.1,
    maxTokens: 700,
    json: true,
  });
}

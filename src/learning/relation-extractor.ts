import { studyAIJson } from "../providers/study-ai-provider";
import type { RelationType } from "../types/world-model";

export interface ExtractedRelation {
  fromConcept: string;
  toConcept: string;
  type: RelationType;
  description: string;
}

export interface RelationExtraction {
  relations: ExtractedRelation[];
}

export async function extractRelationsFromText(text: string): Promise<RelationExtraction> {
  return studyAIJson<RelationExtraction>({
    messages: [
      {
        role: "system",
        content: `
You are ALAI's Relation Extractor.

Your job is to extract reusable conceptual relations from educational text.

Return ONLY valid JSON:

{
  "relations": [
    {
      "fromConcept": "string",
      "toConcept": "string",
      "type": "IS_A" | "PART_OF" | "DEPENDS_ON" | "CAUSES" | "PRODUCES" | "EXPLAINS" | "CONTRADICTS" | "SUPPORTS" | "RELATED_TO" | "USED_FOR" | "REQUIRES" | "LEADS_TO",
      "description": "string"
    }
  ]
}

Rules:
- Extract only meaningful academic relations.
- Prefer canonical concept names in English.
- Do not invent facts not supported by the text.
- Maximum 8 relations.
- If text is insufficient, return {"relations":[]}.
        `.trim(),
      },
      {
        role: "user",
        content: text,
      },
    ],
    temperature: 0.1,
    maxTokens: 900,
    json: true,
  });
}

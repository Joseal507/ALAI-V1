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
      "type": "IS_A" | "PART_OF" | "DEPENDS_ON" | "CAUSES" | "PRODUCES" | "EXPLAINS" | "CONTRADICTS" | "SUPPORTS" | "RELATED_TO" | "USED_FOR" | "REQUIRES" | "LEADS_TO" | "ALIAS_OF" | "ANALOG_OF" | "FORMULA_RELATION",
      "description": "string"
    }
  ]
}

Rules:
- Extract only meaningful academic relations.
- Prefer canonical concept names in English.
- Do not invent facts not supported by the text.
- Maximum 8 relations.
- Use RELATED_TO, not IS_RELATED_TO.
- If the text says "also called", "also known as", or "also referred to as", use ALIAS_OF.
- If the text says "analog", "analogue", or "correspondent", use ANALOG_OF.
- If the text expresses an equation, derivative, or formula relation, use FORMULA_RELATION, not EQUALS.
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

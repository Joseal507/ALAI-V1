import { runAlaiLanguageReasoningBrain } from "./alai-language-reasoning-brain";

export type MemoryResponseRelation = {
  from: string;
  type: string;
  to: string;
  confidence?: number;
};

export type MemoryResponseEvidence = {
  sourceName: string;
  summary: string;
  reliability?: number;
};

export type CanonicalPackForResponse = {
  shortSummary?: string;
  technicalExplanation?: string;
  canonicalExample?: string;
  commonMisconceptions?: string;
  practicalUses?: string;
};

export function generateMemoryResponse(input: {
  userMessage: string;
  conceptName: string;
  description?: string;
  masteryLevel?: string;
  confidence?: number;
  relations: MemoryResponseRelation[];
  evidence: MemoryResponseEvidence[];
  examples?: {
    text: string;
    confidence?: number;
  }[];
  canonicalPack?: CanonicalPackForResponse;
}): string {
  return runAlaiLanguageReasoningBrain({
    userMessage: input.userMessage,
    conceptName: input.conceptName,
    description: input.description,
    masteryLevel: input.masteryLevel,
    confidence: input.confidence,
    relations: input.relations,
    evidence: input.evidence,
    examples: input.examples || [],
    compressedMemory: input.canonicalPack,
  });
}

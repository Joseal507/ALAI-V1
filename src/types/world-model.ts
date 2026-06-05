export type KnowledgeStatus =
  | "CANONICAL"
  | "VERIFIED"
  | "PENDING"
  | "UNCERTAIN"
  | "REJECTED";

export type KnowledgeKind =
  | "CONCEPTUAL"
  | "RELATIONAL"
  | "PROCEDURAL"
  | "PEDAGOGICAL"
  | "STRATEGIC"
  | "METACOGNITIVE";

export type EvidenceType =
  | "BOOK"
  | "PAPER"
  | "WEBSITE"
  | "DOCUMENT"
  | "VIDEO"
  | "USER_INPUT"
  | "AI_MODEL"
  | "STUDYAL_MATERIAL"
  | "UNKNOWN";

export type RelationType =
  | "IS_A"
  | "PART_OF"
  | "DEPENDS_ON"
  | "CAUSES"
  | "PRODUCES"
  | "EXPLAINS"
  | "CONTRADICTS"
  | "SUPPORTS"
  | "RELATED_TO"
  | "USED_FOR"
  | "REQUIRES"
  | "LEADS_TO"
  | "ALIAS_OF"
  | "ANALOG_OF"
  | "FORMULA_RELATION";

export interface Evidence {
  id: string;
  type: EvidenceType;
  sourceName: string;
  sourceUrl?: string;
  author?: string;
  publishedAt?: string;
  capturedAt: string;
  reliabilityScore: number;
  notes?: string;
}

export interface Uncertainty {
  score: number;
  reasons: string[];
  lastCheckedAt: string;
}

export interface ConceptCapability {
  canExplain: boolean;
  canRelate: boolean;
  canApply: boolean;
  canTeach: boolean;
  canDetectErrors: boolean;
  canAnswerNovelQuestions: boolean;
}

export interface ConceptNode {
  id: string;
  name: string;
  aliases: string[];
  description: string;
  kind: KnowledgeKind;
  status: KnowledgeStatus;
  confidenceScore: number;
  uncertainty: Uncertainty;
  evidenceIds: string[];
  relationIds: string[];
  capability: ConceptCapability;
  embedding?: number[];
  createdAt: string;
  updatedAt: string;
}

export interface ConceptRelation {
  id: string;
  fromConceptId: string;
  toConceptId: string;
  type: RelationType;
  description: string;
  confidenceScore: number;
  evidenceIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface WorldModelSnapshot {
  concepts: ConceptNode[];
  relations: ConceptRelation[];
  evidence: Evidence[];
  generatedAt: string;
}

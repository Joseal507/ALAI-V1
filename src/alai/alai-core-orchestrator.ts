import Database from "better-sqlite3";
import crypto from "node:crypto";
import { retrieveBestAlaiConcept } from "./alai-concept-retriever";
import { generateMemoryResponse } from "./alai-memory-response-generator";
import { getCanonicalPack } from "./alai-canonical-pack-repository";

export type AlaiCoreResponse = {
  mode: "ANSWER" | "RESEARCH_NEEDED" | "CONTRADICTION_BLOCKED" | "UNKNOWN";
  answer: string;
  confidence: number;
  concept?: {
    id: string;
    name: string;
    status: string;
    confidence: number;
    masteryScore: number;
    masteryLevel: string;
  };
  evidence: {
    sourceName: string;
    sourceType: string;
    summary: string;
    reliability: number;
  }[];
  examples?: {
    text: string;
    confidence: number;
  }[];
  canonicalPack?: {
    shortSummary?: string;
    technicalExplanation?: string;
    canonicalExample?: string;
    commonMisconceptions?: string;
    practicalUses?: string;
  };
  relations: {
    from: string;
    type: string;
    to: string;
    confidence: number;
  }[];
  actions: string[];
};

type ConceptMatch = {
  id: string;
  name: string;
  description: string;
  status: string;
  confidence: number;
  masteryScore: number;
  masteryLevel: string;
};

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function tokenize(input: string): string[] {
  return normalize(input)
    .replace(/[^a-z0-9áéíóúñü\s]/gi, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

function findBestConcept(db: Database.Database, input: string): ConceptMatch | null {
  const normalizedInput = normalize(input);
  const tokens = tokenize(input);

  const concepts = db.prepare(`
    SELECT
      c.id,
      c.name,
      c.description,
      c.status,
      c.confidence_score AS confidence,
      COALESCE(cm.mastery_score, 0) AS masteryScore,
      COALESCE(cm.mastery_level, 'UNTESTED') AS masteryLevel
    FROM concepts c
    LEFT JOIN concept_mastery cm ON cm.concept_id = c.id
  `).all() as ConceptMatch[];

  let best: ConceptMatch | null = null;
  let bestScore = 0;

  for (const concept of concepts) {
    const conceptName = normalize(concept.name);
    let score = 0;

    if (normalizedInput.includes(conceptName)) score += 10;

    for (const token of tokens) {
      if (conceptName.includes(token)) score += 2;
      if (normalize(concept.description || "").includes(token)) score += 1;
    }

    score += concept.confidence;
    score += concept.masteryScore;

    if (score > bestScore) {
      bestScore = score;
      best = concept;
    }
  }

  return bestScore >= 3 ? best : null;
}

function getEvidence(db: Database.Database, conceptId: string) {
  return db.prepare(`
    SELECT DISTINCT
      e.source_name AS sourceName,
      e.source_type AS sourceType,
      e.content_summary AS summary,
      e.reliability_score AS reliability
    FROM evidence e
    LEFT JOIN concept_evidence ce ON ce.evidence_id = e.id
    LEFT JOIN concept_evidence_links cel ON cel.evidence_id = e.id
    WHERE ce.concept_id = ?
       OR cel.concept_id = ?
    ORDER BY e.reliability_score DESC, e.captured_at DESC
    LIMIT 5
  `).all(conceptId, conceptId) as {
    sourceName: string;
    sourceType: string;
    summary: string;
    reliability: number;
  }[];
}

function getPack(db: Database.Database, conceptId: string) {
  const pack = getCanonicalPack(db, conceptId) as
    | {
        short_summary?: string;
        technical_explanation?: string;
        canonical_example?: string;
        common_misconceptions?: string;
        practical_uses?: string;
      }
    | undefined;

  if (!pack) return undefined;

  return {
    shortSummary: pack.short_summary,
    technicalExplanation: pack.technical_explanation,
    canonicalExample: pack.canonical_example,
    commonMisconceptions: pack.common_misconceptions,
    practicalUses: pack.practical_uses,
  };
}

function getCanonicalExamples(db: Database.Database, conceptId: string) {
  const table = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name = 'canonical_examples'
    LIMIT 1
  `).get() as { name: string } | undefined;

  if (!table) return [];

  return db.prepare(`
    SELECT
      example_text AS text,
      confidence_score AS confidence
    FROM canonical_examples
    WHERE concept_id = ?
    ORDER BY confidence_score DESC, updated_at DESC
    LIMIT 3
  `).all(conceptId) as {
    text: string;
    confidence: number;
  }[];
}

function getRelations(db: Database.Database, conceptId: string) {
  return db.prepare(`
    SELECT
      source.name AS fromConcept,
      r.relation_type AS relationType,
      target.name AS toConcept,
      r.confidence_score AS confidence
    FROM relations r
    JOIN concepts source ON source.id = r.from_concept_id
    JOIN concepts target ON target.id = r.to_concept_id
    WHERE r.from_concept_id = ?
       OR r.to_concept_id = ?
    ORDER BY r.confidence_score DESC
    LIMIT 8
  `).all(conceptId, conceptId) as {
    fromConcept: string;
    relationType: string;
    toConcept: string;
    confidence: number;
  }[];
}

function hasOpenContradiction(db: Database.Database, conceptId: string): boolean {
  const row = db.prepare(`
    SELECT COUNT(*) AS count
    FROM alai_quality_flags qf
    JOIN relations r ON r.id = qf.target_id
    WHERE qf.target_type = 'RELATION'
      AND qf.issue_type = 'CONTRADICTION'
      AND qf.status = 'OPEN'
      AND (
        r.from_concept_id = ?
        OR r.to_concept_id = ?
      )
  `).get(conceptId, conceptId) as { count: number };

  return row.count > 0;
}

function ensureResearchQuestion(
  db: Database.Database,
  conceptId: string,
  conceptName: string,
  reason: string
): boolean {
  const now = new Date().toISOString();
  const question = `What does ALAI need to research to answer about ${conceptName}? Reason: ${reason}`;

  const existing = db.prepare(`
    SELECT id
    FROM alai_research_questions
    WHERE concept_id = ?
      AND question = ?
      AND status = 'OPEN'
    LIMIT 1
  `).get(conceptId, question) as { id: string } | undefined;

  if (existing) return false;

  db.prepare(`
    INSERT INTO alai_research_questions (
      id,
      concept_id,
      topic_id,
      question,
      question_type,
      priority_score,
      status,
      created_at,
      updated_at
    )
    VALUES (?, ?, NULL, ?, 'USER_TRIGGERED_RESEARCH', 0.95, 'OPEN', ?, ?)
  `).run(crypto.randomUUID(), conceptId, question, now, now);

  return true;
}

function buildAnswer(
  input: string,
  concept: ConceptMatch,
  evidence: ReturnType<typeof getEvidence>,
  relations: ReturnType<typeof getRelations>,
  examples: ReturnType<typeof getCanonicalExamples>,
  canonicalPack?: ReturnType<typeof getPack>
): string {
  return generateMemoryResponse({
    userMessage: input,
    conceptName: concept.name,
    description: concept.description,
    masteryLevel: concept.masteryLevel,
    confidence: concept.confidence,
    evidence: evidence.map((item) => ({
      sourceName: item.sourceName,
      summary: item.summary,
      reliability: item.reliability,
    })),
    relations: relations.map((relation) => ({
      from: relation.fromConcept,
      type: relation.relationType,
      to: relation.toConcept,
      confidence: relation.confidence,
    })),
    examples: examples.map((example) => ({
      text: example.text,
      confidence: example.confidence,
    })),
    canonicalPack,
  });
}

export function runAlaiCore(input: string, dbPath = "data/alai.db"): AlaiCoreResponse {
  const db = new Database(dbPath);

  const retrieved = retrieveBestAlaiConcept(db, input);
  const concept = retrieved.found ? retrieved.concept! : null;

  if (!concept) {
    return {
      mode: "UNKNOWN",
      answer: "ALAI todavía no encontró un concepto claro para responder eso. Necesita crear o mapear un concepto antes de investigar.",
      confidence: 0,
      evidence: [],
      relations: [],
      actions: ["NO_SAFE_CONCEPT_MATCH"],
    };
  }

  const evidence = getEvidence(db, concept.id);
  const usefulEvidence = evidence.filter((item) => {
    const source = `${item.sourceName} ${item.summary}`.toLowerCase();
    const conceptName = concept.name.toLowerCase();
    return source.includes(conceptName);
  });

  const examples = getCanonicalExamples(db, concept.id);
  const canonicalPack = getPack(db, concept.id);
  const rawRelations = getRelations(db, concept.id);
  const contradiction = hasOpenContradiction(db, concept.id);

  const relations = rawRelations.map((relation) => ({
    from: relation.fromConcept,
    type: relation.relationType,
    to: relation.toConcept,
    confidence: relation.confidence,
  }));

  if (contradiction) {
    return {
      mode: "CONTRADICTION_BLOCKED",
      answer: `ALAI no debe responder todavía sobre "${concept.name}" porque hay una contradicción abierta relacionada con ese concepto.`,
      confidence: 0.1,
      concept: {
        id: concept.id,
        name: concept.name,
        status: concept.status,
        confidence: concept.confidence,
        masteryScore: concept.masteryScore,
        masteryLevel: concept.masteryLevel,
      },
      evidence: usefulEvidence,
      relations,
      actions: ["BLOCKED_BY_CONTRADICTION"],
    };
  }

  const enoughToAnswer =
    concept.status === "CANONICAL" ||
    (
      concept.status === "VERIFIED" &&
      concept.masteryScore >= 0.68 &&
      usefulEvidence.length >= 1
    ) ||
    (
      concept.masteryScore >= 0.82 &&
      usefulEvidence.length >= 1
    );

  if (!enoughToAnswer) {
    const createdQuestion = ensureResearchQuestion(
      db,
      concept.id,
      concept.name,
      "insufficient mastery, evidence, or verification"
    );

    return {
      mode: "RESEARCH_NEEDED",
      answer: `ALAI conoce "${concept.name}", pero no tiene suficiente evidencia o dominio para responder con seguridad. Se ${createdQuestion ? "creó" : "mantiene"} una pregunta de investigación.`,
      confidence: Math.max(0.15, concept.confidence * 0.5),
      concept: {
        id: concept.id,
        name: concept.name,
        status: concept.status,
        confidence: concept.confidence,
        masteryScore: concept.masteryScore,
        masteryLevel: concept.masteryLevel,
      },
      evidence: usefulEvidence,
      relations,
      actions: [createdQuestion ? "CREATED_RESEARCH_QUESTION" : "RESEARCH_QUESTION_ALREADY_EXISTS"],
    };
  }

  return {
    mode: "ANSWER",
    answer: buildAnswer(input, concept, usefulEvidence, rawRelations, examples, canonicalPack),
    confidence: Math.min(0.95, concept.confidence * 0.5 + concept.masteryScore * 0.5),
    concept: {
      id: concept.id,
      name: concept.name,
      status: concept.status,
      confidence: concept.confidence,
      masteryScore: concept.masteryScore,
      masteryLevel: concept.masteryLevel,
    },
    evidence: usefulEvidence,
    relations,
    actions: ["ANSWERED_FROM_CORE_MEMORY"],
  };
}

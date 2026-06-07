import Database from "better-sqlite3";
import crypto from "node:crypto";
import { extractConceptsFromText } from "../learning/learning-extractor";
import { extractRelationsFromText } from "../learning/relation-extractor";
import { validateExtractedConcepts, validateExtractedRelations } from "../learning/knowledge-validator";
import { decideConceptAcceptance, decideRelationAcceptance } from "../learning/knowledge-acceptance-engine";
import { shouldAutoLearnConcept } from "../learning/concept-rank-engine";
import { evaluateAutonomousLearningTarget } from "./governance-brain";
import { createLearningBudget, canInsertConcept, canInsertRelation, type LearningBudget } from "./learning-budget";


function normalizeExtractedRelationType(type: string): string {
  const normalized = type.trim().toUpperCase();

  if (normalized === "IS_RELATED_TO") return "RELATED_TO";
  if (normalized === "EQUALS") return "FORMULA_RELATION";

  if (normalized === "CONTAINS") return "PART_OF";
  if (normalized === "HAS") return "PART_OF";
  if (normalized === "HAS_PART") return "PART_OF";

  if (normalized === "AFFECTS") return "CHANGES";
  if (normalized === "INFLUENCES") return "CHANGES";
  if (normalized === "MODIFIES") return "CHANGES";

  if (normalized === "REQUIRES") return "DEPENDS_ON";
  if (normalized === "NEEDS") return "DEPENDS_ON";

  if (normalized === "DESCRIBES") return "EXPLAINS";
  if (normalized === "EXPLAINS_TO") return "EXPLAINS";

  return normalized;
}

function getExistingConceptNames(db: Database.Database): string[] {
  const rows = db.prepare(`SELECT name FROM concepts`).all() as { name: string }[];
  return rows.map((row) => row.name);
}

function getOrCreateConcept(
  db: Database.Database,
  name: string,
  description: string,
  budget?: LearningBudget
): string | null {
  const existing = db.prepare(`
    SELECT id FROM concepts
    WHERE lower(name) = lower(?)
    LIMIT 1
  `).get(name) as { id: string } | undefined;

  if (existing) return existing.id;

  const governance = evaluateAutonomousLearningTarget({ name, description });

  if (!governance.allowed) {
    console.warn("Rejected concept by governance:", governance.reason, { name, score: governance.score });
    return null;
  }

  if (budget && !canInsertConcept(budget)) {
    console.warn("Rejected concept by budget:", { name, maxNewConcepts: budget.maxNewConcepts });
    return null;
  }

  if (!shouldAutoLearnConcept(name, description)) {
    console.warn("Rejected concept by rank engine:", { name, description });
    return null;
  }

  const acceptance = decideConceptAcceptance({
    name,
    description,
    existingConceptNames: getExistingConceptNames(db),
  });

  if (!acceptance.accepted) {
    console.warn("Rejected concept by acceptance:", acceptance.reason, { name });
    return null;
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  db.prepare(`
    INSERT INTO concepts (
      id, name, description, status, confidence_score, uncertainty_score, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, description, "PENDING", 0.3, 0.7, now, now);

  if (budget) budget.conceptsInserted++;

  return id;
}

export async function learnKnowledgeFromEvidenceText(
  db: Database.Database,
  text: string
): Promise<{ conceptsInserted: number; relationsInserted: number; skipped: number }> {
  let conceptsInserted = 0;
  let relationsInserted = 0;
  let skipped = 0;
  const budget = createLearningBudget();

  const conceptExtraction = await extractConceptsFromText(text);
  const conceptValidation = validateExtractedConcepts(conceptExtraction.concepts);

  for (const rejected of conceptValidation.rejected) {
    console.warn("Rejected concept:", rejected.reason, rejected.item);
    skipped++;
  }

  for (const concept of conceptValidation.accepted) {
    const before = db.prepare(`SELECT COUNT(*) AS count FROM concepts WHERE lower(name) = lower(?)`)
      .get(concept.name) as { count: number };

    const id = getOrCreateConcept(db, concept.name, concept.description, budget);

    if (!id) {
      skipped++;
      continue;
    }

    if (before.count === 0) conceptsInserted++;
  }

  const relationExtraction = await extractRelationsFromText(text);
  const normalizedRelations = relationExtraction.relations.map((relation) => ({
    ...relation,
    type: normalizeExtractedRelationType(relation.type) as typeof relation.type,
  }));

  const relationValidation = validateExtractedRelations(normalizedRelations);

  for (const rejected of relationValidation.rejected) {
    console.warn("Rejected relation:", rejected.reason, rejected.item);
    skipped++;
  }

  for (const relation of relationValidation.accepted) {
    const relationAcceptance = decideRelationAcceptance({
      fromConcept: relation.fromConcept,
      toConcept: relation.toConcept,
      type: relation.type,
      description: relation.description,
    });

    if (!relationAcceptance.accepted) {
      console.warn("Rejected relation by acceptance:", relationAcceptance.reason, relation);
      skipped++;
      continue;
    }

    if (!canInsertRelation(budget)) {
      console.warn("Rejected relation by budget:", {
        fromConcept: relation.fromConcept,
        toConcept: relation.toConcept,
        maxNewRelations: budget.maxNewRelations,
      });
      skipped++;
      continue;
    }

    const fromId = getOrCreateConcept(
      db,
      relation.fromConcept,
      `Concept discovered during autonomous relation learning: ${relation.fromConcept}`,
      budget
    );
    const toId = getOrCreateConcept(
      db,
      relation.toConcept,
      `Concept discovered during autonomous relation learning: ${relation.toConcept}`,
      budget
    );

    if (!fromId || !toId) {
      skipped++;
      continue;
    }

    const existing = db.prepare(`
      SELECT id FROM relations
      WHERE from_concept_id = ?
        AND to_concept_id = ?
        AND relation_type = ?
      LIMIT 1
    `).get(fromId, toId, relation.type) as { id: string } | undefined;

    if (existing) {
      skipped++;
      continue;
    }

    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO relations (
        id, from_concept_id, to_concept_id, relation_type, description, confidence_score, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      fromId,
      toId,
      relation.type,
      relation.description,
      0.35,
      now,
      now
    );

    relationsInserted++;
    budget.relationsInserted++;
  }

  return { conceptsInserted, relationsInserted, skipped };
}

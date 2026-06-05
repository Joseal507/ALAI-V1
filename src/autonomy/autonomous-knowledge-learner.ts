import Database from "better-sqlite3";
import crypto from "node:crypto";
import { extractConceptsFromText } from "../learning/learning-extractor";
import { extractRelationsFromText } from "../learning/relation-extractor";
import { validateExtractedConcepts, validateExtractedRelations } from "../learning/knowledge-validator";
import { decideConceptAcceptance, decideRelationAcceptance } from "../learning/knowledge-acceptance-engine";
import { shouldAutoLearnConcept } from "../learning/concept-rank-engine";


function normalizeExtractedRelationType(type: string): string {
  const normalized = type.trim().toUpperCase();

  if (normalized === "IS_RELATED_TO") return "RELATED_TO";
  if (normalized === "EQUALS") return "FORMULA_RELATION";

  return normalized;
}

function getExistingConceptNames(db: Database.Database): string[] {
  const rows = db.prepare(`SELECT name FROM concepts`).all() as { name: string }[];
  return rows.map((row) => row.name);
}

function getOrCreateConcept(db: Database.Database, name: string, description: string): string | null {
  const existing = db.prepare(`
    SELECT id FROM concepts
    WHERE lower(name) = lower(?)
    LIMIT 1
  `).get(name) as { id: string } | undefined;

  if (existing) return existing.id;

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

  return id;
}

export async function learnKnowledgeFromEvidenceText(
  db: Database.Database,
  text: string
): Promise<{ conceptsInserted: number; relationsInserted: number; skipped: number }> {
  let conceptsInserted = 0;
  let relationsInserted = 0;
  let skipped = 0;

  const conceptExtraction = await extractConceptsFromText(text);
  const conceptValidation = validateExtractedConcepts(conceptExtraction.concepts);

  for (const rejected of conceptValidation.rejected) {
    console.warn("Rejected concept:", rejected.reason, rejected.item);
    skipped++;
  }

  for (const concept of conceptValidation.accepted) {
    const before = db.prepare(`SELECT COUNT(*) AS count FROM concepts WHERE lower(name) = lower(?)`)
      .get(concept.name) as { count: number };

    const id = getOrCreateConcept(db, concept.name, concept.description);

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

    const fromId = getOrCreateConcept(
      db,
      relation.fromConcept,
      `Concept discovered during autonomous relation learning: ${relation.fromConcept}`
    );
    const toId = getOrCreateConcept(
      db,
      relation.toConcept,
      `Concept discovered during autonomous relation learning: ${relation.toConcept}`
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
  }

  return { conceptsInserted, relationsInserted, skipped };
}

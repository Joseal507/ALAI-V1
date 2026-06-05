import Database from "better-sqlite3";
import crypto from "node:crypto";
import { extractRelationsFromText } from "../src/learning/relation-extractor";
import { validateExtractedRelations } from "../src/learning/knowledge-validator";
import { decideConceptAcceptance, decideRelationAcceptance } from "../src/learning/knowledge-acceptance-engine";
import { evaluateRelationQuality } from "../src/learning/relation-quality-engine";
import { shouldAutoLearnConcept } from "../src/learning/concept-rank-engine";
import { classifyRelationOntology } from "../src/ontology/relation-classifier";

function getOrCreateConcept(db: Database.Database, name: string): string | null {
  const existing = db.prepare(`
    SELECT id FROM concepts
    WHERE lower(name) = lower(?)
    LIMIT 1
  `).get(name) as { id: string } | undefined;

  if (existing) return existing.id;

  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const existingConceptNames = db.prepare(`
    SELECT name FROM concepts
  `).all() as { name: string }[];

  const description = `Concept discovered during relation extraction: ${name}`;

  if (!shouldAutoLearnConcept(name, description)) {
    console.warn("Rejected new relation concept by rank engine:", { name });
    return null;
  }

  const acceptance = decideConceptAcceptance({
    name,
    description,
    existingConceptNames: existingConceptNames.map((row) => row.name),
  });

  if (!acceptance.accepted) {
    console.warn("Rejected new relation concept:", acceptance.reason, { name });
    return null;
  }

  db.prepare(`
    INSERT INTO concepts (
      id,
      name,
      description,
      status,
      confidence_score,
      uncertainty_score,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    name,
    description,
    "PENDING",
    0.25,
    0.75,
    now,
    now
  );

  return id;
}

async function main() {
  const db = new Database("data/alai.db");

  const rows = db.prepare(`
    SELECT id, source_name, content_summary
    FROM evidence
    ORDER BY captured_at DESC
    LIMIT 8
  `).all() as {
    id: string;
    source_name: string;
    content_summary: string;
  }[];

  let inserted = 0;
  let skipped = 0;

  for (const row of rows) {
    const extraction = await extractRelationsFromText(
      `${row.source_name}\n${row.content_summary}`
    );

    const validation = validateExtractedRelations(extraction.relations);

    for (const rejected of validation.rejected) {
      console.warn("Rejected relation:", rejected.reason, rejected.item);
    }

    for (const relation of validation.accepted) {
      const relationAcceptance = decideRelationAcceptance({
        fromConcept: relation.fromConcept,
        toConcept: relation.toConcept,
        type: relation.type,
        description: relation.description,
      });

      if (!relationAcceptance.accepted) {
        console.warn("Rejected by relation acceptance engine:", relationAcceptance.reason, relation);
        skipped++;
        continue;
      }

      const ontology = classifyRelationOntology({
        fromConcept: relation.fromConcept,
        toConcept: relation.toConcept,
        relationType: relation.type,
        description: relation.description,
      });

      if (!ontology.accepted) {
        console.warn("Rejected by ontology engine:", ontology.reason, relation);
        skipped++;
        continue;
      }

      const quality = evaluateRelationQuality({
        fromConcept: relation.fromConcept,
        toConcept: relation.toConcept,
        relationType: ontology.relationType,
        description: relation.description,
      });

      if (!quality.accepted) {
        console.warn("Rejected by relation quality engine:", quality.reason, relation);
        skipped++;
        continue;
      }

      const fromId = getOrCreateConcept(db, relation.fromConcept);
      const toId = getOrCreateConcept(db, relation.toConcept);

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
      const relationId = crypto.randomUUID();

      db.prepare(`
        INSERT INTO relations (
          id,
          from_concept_id,
          to_concept_id,
          relation_type,
          description,
          confidence_score,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        relationId,
        fromId,
        toId,
        ontology.relationType,
        relation.description,
        0.35,
        now,
        now
      );

      inserted++;
    }
  }

  console.log("Relation learning completed.");
  console.log({ inserted, skipped });
}

main().catch((error) => {
  console.error("Relation learning failed:");
  console.error(error);
  process.exit(1);
});

import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");

type AliasRelation = {
  relationId: string;
  sourceConceptId: string;
  sourceConceptName: string;
  sourceStatus: string;
  sourceConfidence: number;
  targetConceptId: string;
  targetConceptName: string;
  targetStatus: string;
  targetConfidence: number;
};

const aliasRelations = db.prepare(`
  SELECT
    relations.id AS relationId,
    source.id AS sourceConceptId,
    source.name AS sourceConceptName,
    source.status AS sourceStatus,
    source.confidence_score AS sourceConfidence,
    target.id AS targetConceptId,
    target.name AS targetConceptName,
    target.status AS targetStatus,
    target.confidence_score AS targetConfidence
  FROM relations
  JOIN concepts AS source ON source.id = relations.from_concept_id
  JOIN concepts AS target ON target.id = relations.to_concept_id
  WHERE relations.relation_type = 'ALIAS_OF'
`).all() as AliasRelation[];

const PREFERRED_CANONICAL_NAMES = new Set([
  "angular momentum",
  "torque",
  "photosynthesis",
  "angular frequency",
  "rigid body dynamics",
  "rotational motion",
]);

function canonicalScore(name: string, status: string, confidence: number): number {
  const lower = name.toLowerCase().trim();

  let score = 0;

  if (PREFERRED_CANONICAL_NAMES.has(lower)) score += 100;
  if (status === "CANONICAL") score += 50;
  if (status === "VERIFIED") score += 30;

  score += confidence * 20;

  if (lower.startsWith("moment of ")) score -= 40;
  if (lower === "moment") score -= 60;
  if (lower.startsWith("rotational ")) score -= 5;

  score -= Math.max(0, name.length - 28) * 0.2;

  return score;
}

function chooseCanonical(item: AliasRelation) {
  const sourceScore = canonicalScore(
    item.sourceConceptName,
    item.sourceStatus,
    item.sourceConfidence
  );

  const targetScore = canonicalScore(
    item.targetConceptName,
    item.targetStatus,
    item.targetConfidence
  );

  if (sourceScore >= targetScore) {
    return {
      canonicalId: item.sourceConceptId,
      canonicalName: item.sourceConceptName,
      aliasId: item.targetConceptId,
      aliasName: item.targetConceptName,
    };
  }

  return {
    canonicalId: item.targetConceptId,
    canonicalName: item.targetConceptName,
    aliasId: item.sourceConceptId,
    aliasName: item.sourceConceptName,
  };
}

let merged = 0;
let skipped = 0;

const tx = db.transaction((item: AliasRelation) => {
  if (item.sourceConceptId === item.targetConceptId) {
    skipped++;
    return;
  }

  const choice = chooseCanonical(item);

  const aliasStillExists = db.prepare(`
    SELECT id FROM concepts
    WHERE id = ?
    LIMIT 1
  `).get(choice.aliasId) as { id: string } | undefined;

  const canonicalStillExists = db.prepare(`
    SELECT id FROM concepts
    WHERE id = ?
    LIMIT 1
  `).get(choice.canonicalId) as { id: string } | undefined;

  if (!aliasStillExists || !canonicalStillExists) {
    skipped++;
    return;
  }

  const existingAlias = db.prepare(`
    SELECT id FROM concept_aliases
    WHERE concept_id = ?
      AND lower(alias) = lower(?)
    LIMIT 1
  `).get(choice.canonicalId, choice.aliasName) as { id: string } | undefined;

  if (!existingAlias) {
    db.prepare(`
      INSERT INTO concept_aliases (
        id,
        concept_id,
        alias,
        created_at
      ) VALUES (?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      choice.canonicalId,
      choice.aliasName,
      new Date().toISOString()
    );
  }

  db.prepare(`
    UPDATE concept_evidence
    SET concept_id = ?
    WHERE concept_id = ?
  `).run(choice.canonicalId, choice.aliasId);

  db.prepare(`
    UPDATE capabilities
    SET concept_id = ?
    WHERE concept_id = ?
  `).run(choice.canonicalId, choice.aliasId);

  db.prepare(`
    UPDATE concept_aliases
    SET concept_id = ?
    WHERE concept_id = ?
  `).run(choice.canonicalId, choice.aliasId);

  const conceptReferenceUpdates: Array<[string, string]> = [
    ["alai_autonomous_exams", "concept_id"],
    ["alai_concept_competencies", "concept_id"],
    ["alai_concept_self_tests", "concept_id"],
    ["alai_evidence_grounded_exams", "concept_id"],
    ["alai_mastery_validations", "concept_id"],
    ["common_errors", "concept_id"],
    ["concept_evidence_links", "concept_id"],
    ["concept_mastery", "concept_id"],
    ["concept_stage_flags", "concept_id"],
    ["topic_concepts", "concept_id"],
  ];

  for (const [table, column] of conceptReferenceUpdates) {
    db.prepare(`
      UPDATE OR IGNORE ${table}
      SET ${column} = ?
      WHERE ${column} = ?
    `).run(choice.canonicalId, choice.aliasId);
  }

  db.prepare(`
    UPDATE OR IGNORE concept_prerequisites
    SET concept_id = ?
    WHERE concept_id = ?
  `).run(choice.canonicalId, choice.aliasId);

  db.prepare(`
    UPDATE OR IGNORE concept_prerequisites
    SET prerequisite_concept_id = ?
    WHERE prerequisite_concept_id = ?
  `).run(choice.canonicalId, choice.aliasId);

  db.prepare(`
    UPDATE relations
    SET from_concept_id = ?
    WHERE from_concept_id = ?
  `).run(choice.canonicalId, choice.aliasId);

  db.prepare(`
    UPDATE relations
    SET to_concept_id = ?
    WHERE to_concept_id = ?
  `).run(choice.canonicalId, choice.aliasId);

  db.prepare(`
    DELETE FROM relations
    WHERE from_concept_id = to_concept_id
       OR id = ?
  `).run(item.relationId);

  const conceptReferenceDeletes: Array<[string, string]> = [
    ["alai_autonomous_exams", "concept_id"],
    ["alai_concept_competencies", "concept_id"],
    ["alai_concept_self_tests", "concept_id"],
    ["alai_evidence_grounded_exams", "concept_id"],
    ["alai_mastery_validations", "concept_id"],
    ["common_errors", "concept_id"],
    ["concept_evidence_links", "concept_id"],
    ["concept_mastery", "concept_id"],
    ["concept_stage_flags", "concept_id"],
    ["topic_concepts", "concept_id"],
  ];

  for (const [table, column] of conceptReferenceDeletes) {
    db.prepare(`
      DELETE FROM ${table}
      WHERE ${column} = ?
    `).run(choice.aliasId);
  }

  db.prepare(`
    DELETE FROM concept_prerequisites
    WHERE concept_id = ?
       OR prerequisite_concept_id = ?
  `).run(choice.aliasId, choice.aliasId);

  db.prepare(`
    UPDATE knowledge_gaps
    SET concept_id = ?
    WHERE concept_id = ?
  `).run(choice.canonicalId, choice.aliasId);

  db.prepare(`
    DELETE FROM concepts
    WHERE id = ?
  `).run(choice.aliasId);

  merged++;
  console.log("Merged alias concept:", choice.aliasName, "->", choice.canonicalName);
});

for (const item of aliasRelations) {
  tx(item);
}

console.log("Alias concept merge completed.");
console.log({ merged, skipped });

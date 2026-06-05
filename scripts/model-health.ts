import Database from "better-sqlite3";
import { rankConcept } from "../src/learning/concept-rank-engine";

const db = new Database("data/alai.db");

const concepts = db.prepare(`
  SELECT id, name, description, status
  FROM concepts
`).all() as { id: string; name: string; description: string; status: string }[];

const relations = db.prepare(`
  SELECT id, relation_type AS relationType, from_concept_id, to_concept_id
  FROM relations
`).all() as { id: string; relationType: string; from_concept_id: string; to_concept_id: string }[];

const duplicateRelations = db.prepare(`
  SELECT COUNT(*) AS count
  FROM (
    SELECT from_concept_id, to_concept_id, relation_type
    FROM relations
    GROUP BY from_concept_id, to_concept_id, relation_type
    HAVING COUNT(*) > 1
  )
`).get() as { count: number };

const conceptRanks = concepts.map((concept) => ({
  ...concept,
  rank: rankConcept(concept.name, concept.description),
}));

const core = conceptRanks.filter((c) => c.rank === "CORE").length;
const supporting = conceptRanks.filter((c) => c.rank === "SUPPORTING").length;
const noise = conceptRanks.filter((c) => c.rank === "NOISE").length;
const verified = concepts.filter((c) => c.status === "VERIFIED").length;
const pending = concepts.filter((c) => c.status === "PENDING").length;

const score = Math.max(
  0,
  Math.min(
    100,
    Math.round(
      50 +
      verified * 4 +
      core * 2 +
      supporting * 0.5 -
      noise * 3 -
      duplicateRelations.count * 4
    )
  )
);

console.log("\n=== ALAI World Model Health ===");
console.log({
  concepts: concepts.length,
  relations: relations.length,
  coreConcepts: core,
  supportingConcepts: supporting,
  noiseConcepts: noise,
  verifiedConcepts: verified,
  pendingConcepts: pending,
  duplicateRelationGroups: duplicateRelations.count,
  healthScore: `${score}/100`,
});

if (noise > 0) {
  console.log("\nNoise concepts:");
  console.table(conceptRanks.filter((c) => c.rank === "NOISE").map((c) => ({
    name: c.name,
    status: c.status,
  })));
}

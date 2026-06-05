import Database from "better-sqlite3";
import { decideKnowledgePromotion } from "../src/learning/knowledge-promotion-engine";

const db = new Database("data/alai.db");

const rows = db.prepare(`
  SELECT
    concepts.id,
    concepts.name,
    concepts.status,
    concepts.confidence_score AS confidenceScore,
    COUNT(DISTINCT concept_evidence.evidence_id) AS evidenceCount,
    COUNT(DISTINCT relations.id) AS relationCount,
    COUNT(DISTINCT capabilities.id) AS capabilityCount
  FROM concepts
  LEFT JOIN concept_evidence ON concept_evidence.concept_id = concepts.id
  LEFT JOIN relations
    ON relations.from_concept_id = concepts.id
    OR relations.to_concept_id = concepts.id
  LEFT JOIN capabilities ON capabilities.concept_id = concepts.id
  GROUP BY concepts.id
`).all() as {
  id: string;
  name: string;
  status: string;
  confidenceScore: number;
  evidenceCount: number;
  relationCount: number;
  capabilityCount: number;
}[];

let promoted = 0;
let skipped = 0;

for (const row of rows) {
  const decision = decideKnowledgePromotion({
    conceptName: row.name,
    status: row.status,
    evidenceCount: row.evidenceCount,
    relationCount: row.relationCount,
    capabilityCount: row.capabilityCount,
    confidenceScore: row.confidenceScore,
  });

  if (!decision.shouldPromote) {
    skipped++;
    continue;
  }

  db.prepare(`
    UPDATE concepts
    SET status = ?,
        confidence_score = ?,
        uncertainty_score = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    decision.nextStatus,
    decision.nextConfidence,
    Math.max(0, 1 - decision.nextConfidence),
    new Date().toISOString(),
    row.id
  );

  promoted++;
  console.log("Promoted:", row.name, decision);
}

console.log("Knowledge promotion completed.");
console.log({ promoted, skipped });

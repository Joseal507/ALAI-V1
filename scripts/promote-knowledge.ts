import Database from "better-sqlite3";
import { decideKnowledgePromotion } from "../src/learning/knowledge-promotion-engine";

type Row = {
  id: string;
  name: string;
  status: string;
  confidenceScore: number;
  directEvidenceCount: number;
  relationCount: number;
  capabilityCount: number;
};

type CountRow = {
  count: number;
};

const db = new Database("data/alai.db");

function tableExists(tableName: string): boolean {
  const row = db.prepare(`
    SELECT COUNT(*) AS count
    FROM sqlite_master
    WHERE type = 'table'
      AND name = ?
  `).get(tableName) as CountRow;

  return row.count > 0;
}

const hasEvidenceLinks = tableExists("concept_evidence_links");
const hasGroundedExams = tableExists("alai_evidence_grounded_exams");

const rows = db.prepare(`
  SELECT
    concepts.id,
    concepts.name,
    concepts.status,
    concepts.confidence_score AS confidenceScore,
    COUNT(DISTINCT concept_evidence.evidence_id) AS directEvidenceCount,
    COUNT(DISTINCT relations.id) AS relationCount,
    COUNT(DISTINCT capabilities.id) AS capabilityCount
  FROM concepts
  LEFT JOIN concept_evidence ON concept_evidence.concept_id = concepts.id
  LEFT JOIN relations
    ON relations.from_concept_id = concepts.id
    OR relations.to_concept_id = concepts.id
  LEFT JOIN capabilities ON capabilities.concept_id = concepts.id
  GROUP BY concepts.id
`).all() as Row[];

let promoted = 0;
let skipped = 0;

for (const row of rows) {
  const linkedEvidenceCount = hasEvidenceLinks
    ? (db.prepare(`
        SELECT COUNT(*) AS count
        FROM concept_evidence_links
        WHERE concept_id = ?
      `).get(row.id) as CountRow).count
    : 0;

  const externalDirectEvidence = (db.prepare(`
    SELECT COUNT(DISTINCT ce.evidence_id) AS count
    FROM concept_evidence ce
    JOIN evidence e ON e.id = ce.evidence_id
    WHERE ce.concept_id = ?
      AND upper(COALESCE(e.source_type, '')) NOT IN ('INTERNAL', 'AI_INTERNAL', 'SELF_GENERATED', 'VERIFIED_INTERNAL')
      AND length(trim(COALESCE(e.content_summary, ''))) >= 80
  `).get(row.id) as CountRow).count;

  const externalLinkedEvidence = hasEvidenceLinks
    ? (db.prepare(`
        SELECT COUNT(DISTINCT cel.evidence_id) AS count
        FROM concept_evidence_links cel
        JOIN evidence e ON e.id = cel.evidence_id
        WHERE cel.concept_id = ?
          AND upper(COALESCE(e.source_type, '')) NOT IN ('INTERNAL', 'AI_INTERNAL', 'SELF_GENERATED', 'VERIFIED_INTERNAL')
          AND length(trim(COALESCE(e.content_summary, ''))) >= 80
      `).get(row.id) as CountRow).count
    : 0;

  const groundedExamPassed = hasGroundedExams
    ? Boolean((db.prepare(`
        SELECT 1
        FROM alai_evidence_grounded_exams
        WHERE concept_id = ?
          AND passed = 1
        LIMIT 1
      `).get(row.id)))
    : false;

  const evidenceCount = row.directEvidenceCount + linkedEvidenceCount;
  const externalEvidenceCount = externalDirectEvidence + externalLinkedEvidence;

  const decision = decideKnowledgePromotion({
    conceptName: row.name,
    status: row.status,
    evidenceCount,
    externalEvidenceCount,
    groundedExamPassed,
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
  console.log("Promoted:", row.name, {
    ...decision,
    evidenceCount,
    externalEvidenceCount,
    groundedExamPassed,
    relationCount: row.relationCount,
    capabilityCount: row.capabilityCount,
  });
}

console.log("Knowledge promotion completed.");
console.log({ promoted, skipped });

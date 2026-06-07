import Database from "better-sqlite3";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

const resolvedVerifiedWithoutEvidence = db.prepare(`
  UPDATE alai_quality_flags
  SET status = 'RESOLVED',
      updated_at = ?
  WHERE target_type = 'CONCEPT'
    AND issue_type = 'VERIFIED_WITHOUT_EXTERNAL_EVIDENCE'
    AND status = 'OPEN'
    AND target_id IN (
      SELECT c.id
      FROM concepts c
      WHERE c.status = 'PENDING'
    )
`).run(now);

const resolvedNoEvidenceIfNowHasEvidence = db.prepare(`
  UPDATE alai_quality_flags
  SET status = 'RESOLVED',
      updated_at = ?
  WHERE target_type = 'CONCEPT'
    AND issue_type = 'NO_EVIDENCE'
    AND status = 'OPEN'
    AND target_id IN (
      SELECT cel.concept_id
      FROM concept_evidence_links cel
      JOIN evidence e ON e.id = cel.evidence_id
      WHERE upper(COALESCE(e.source_type, '')) NOT IN ('INTERNAL', 'AI_INTERNAL', 'SELF_GENERATED')
      GROUP BY cel.concept_id
      HAVING COUNT(*) >= 2
    )
`).run(now);

const resolvedOrphanIfNowMapped = db.prepare(`
  UPDATE alai_quality_flags
  SET status = 'RESOLVED',
      updated_at = ?
  WHERE target_type = 'CONCEPT'
    AND issue_type = 'ORPHAN_CONCEPT'
    AND status = 'OPEN'
    AND target_id IN (
      SELECT concept_id
      FROM topic_concepts
    )
`).run(now);

const downgradeAmbiguous = db.prepare(`
  UPDATE alai_quality_flags
  SET severity = 'MEDIUM',
      updated_at = ?
  WHERE target_type = 'CONCEPT'
    AND issue_type = 'AMBIGUOUS_CONCEPT'
    AND status = 'OPEN'
`).run(now);

console.log("ALAI flag triage completed.");
console.log({
  resolvedVerifiedWithoutEvidence: resolvedVerifiedWithoutEvidence.changes,
  resolvedNoEvidenceIfNowHasEvidence: resolvedNoEvidenceIfNowHasEvidence.changes,
  resolvedOrphanIfNowMapped: resolvedOrphanIfNowMapped.changes,
  downgradedAmbiguous: downgradeAmbiguous.changes,
});

console.table(db.prepare(`
  SELECT target_type, issue_type, severity, status, COUNT(*) AS count
  FROM alai_quality_flags
  GROUP BY target_type, issue_type, severity, status
  ORDER BY status ASC, count DESC
`).all());

import Database from "better-sqlite3";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

const closedQuestionCleanup = db.prepare(`
  UPDATE alai_quality_flags
  SET status = 'RESOLVED',
      updated_at = ?
  WHERE target_type = 'QUESTION'
    AND issue_type = 'DUPLICATE_QUESTION_GROUP_CLEANED'
    AND status = 'OPEN'
`).run(now);

const resolvedConceptFlags = db.prepare(`
  UPDATE alai_quality_flags
  SET status = 'RESOLVED',
      updated_at = ?
  WHERE target_type = 'CONCEPT'
    AND status = 'OPEN'
    AND target_id IN (
      SELECT c.id
      FROM concepts c
      JOIN concept_mastery cm ON cm.concept_id = c.id
      WHERE c.status = 'VERIFIED'
        AND cm.mastery_score >= 0.82
        AND (
          SELECT COUNT(*)
          FROM concept_evidence_links cel
          JOIN evidence e ON e.id = cel.evidence_id
          WHERE cel.concept_id = c.id
            AND upper(COALESCE(e.source_type, '')) NOT IN ('INTERNAL', 'AI_INTERNAL', 'SELF_GENERATED')
        ) >= 2
    )
`).run(now);

console.log("ALAI quality flag cleaner completed.");
console.log({
  duplicateQuestionFlagsResolved: closedQuestionCleanup.changes,
  conceptFlagsResolved: resolvedConceptFlags.changes,
});

console.table(db.prepare(`
  SELECT target_type, issue_type, severity, status, COUNT(*) AS count
  FROM alai_quality_flags
  GROUP BY target_type, issue_type, severity, status
  ORDER BY status ASC, count DESC
`).all());

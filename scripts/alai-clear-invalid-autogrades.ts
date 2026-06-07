import Database from "better-sqlite3";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

const selfTests = db.prepare(`
  UPDATE alai_concept_self_tests
  SET passed = 0,
      score = MIN(score, 0.69),
      reason = reason || ' | Invalidated: missing external evidence gate.',
      updated_at = ?
  WHERE concept_id IN (
    SELECT c.id
    FROM concepts c
    LEFT JOIN concept_stage_flags f ON f.concept_id = c.id
    WHERE COALESCE(f.status, '') = 'FROZEN'
       OR (
        SELECT COUNT(*)
        FROM concept_evidence_links cel
        JOIN evidence e ON e.id = cel.evidence_id
        WHERE cel.concept_id = c.id
          AND upper(COALESCE(e.source_type, '')) NOT IN ('INTERNAL', 'AI_INTERNAL', 'SELF_GENERATED')
      ) < 1
  )
`).run(now);

const exams = db.prepare(`
  UPDATE alai_autonomous_exams
  SET passed = 0,
      score = MIN(score, 0.69),
      reason = reason || ' | Invalidated: missing external evidence gate.',
      updated_at = ?
  WHERE concept_id IN (
    SELECT c.id
    FROM concepts c
    LEFT JOIN concept_stage_flags f ON f.concept_id = c.id
    WHERE COALESCE(f.status, '') = 'FROZEN'
       OR (
        SELECT COUNT(*)
        FROM concept_evidence_links cel
        JOIN evidence e ON e.id = cel.evidence_id
        WHERE cel.concept_id = c.id
          AND upper(COALESCE(e.source_type, '')) NOT IN ('INTERNAL', 'AI_INTERNAL', 'SELF_GENERATED')
      ) < 2
  )
`).run(now);

console.log("ALAI invalid autogrades cleared.");
console.log({
  selfTestsInvalidated: selfTests.changes,
  examsInvalidated: exams.changes,
});

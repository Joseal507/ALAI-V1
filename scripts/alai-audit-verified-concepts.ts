import Database from "better-sqlite3";

const db = new Database("data/alai.db");

const rows = db.prepare(`
  SELECT
    c.id,
    c.name,
    c.status,
    c.confidence_score AS confidence,
    COALESCE((
      SELECT COUNT(DISTINCT cel.evidence_id)
      FROM concept_evidence_links cel
      JOIN evidence e ON e.id = cel.evidence_id
      WHERE cel.concept_id = c.id
        AND upper(COALESCE(e.source_type, '')) NOT IN ('INTERNAL', 'AI_INTERNAL', 'SELF_GENERATED', 'VERIFIED_INTERNAL')
        AND length(trim(COALESCE(e.content_summary, ''))) >= 80
    ), 0) AS externalEvidence,
    COALESCE((
      SELECT COUNT(*)
      FROM alai_evidence_grounded_exams gx
      WHERE gx.concept_id = c.id
        AND gx.passed = 1
    ), 0) AS groundedPassed,
    COALESCE((
      SELECT COUNT(*)
      FROM alai_autonomous_exams ex
      WHERE ex.concept_id = c.id
        AND ex.passed = 1
    ), 0) AS autonomousPassed,
    COALESCE((
      SELECT COUNT(*)
      FROM alai_concept_self_tests st
      WHERE st.concept_id = c.id
        AND st.passed = 1
    ), 0) AS selfTestsPassed,
    COALESCE((
      SELECT mastery_score
      FROM concept_mastery cm
      WHERE cm.concept_id = c.id
    ), 0) AS mastery
  FROM concepts c
  WHERE c.status = 'VERIFIED'
  ORDER BY mastery DESC, externalEvidence DESC, c.name ASC
`).all();

console.log("ALAI verified concept audit.");
console.table(rows);

const weak = rows.filter((row: any) =>
  row.externalEvidence < 2 &&
  row.groundedPassed < 1
);

console.log({
  verified: rows.length,
  weakVerified: weak.length,
});

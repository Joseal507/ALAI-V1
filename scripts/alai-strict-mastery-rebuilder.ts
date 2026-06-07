import Database from "better-sqlite3";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

const rows = db.prepare(`
  SELECT
    c.id,
    c.name,
    c.status,
    COALESCE((
      SELECT COUNT(*)
      FROM concept_evidence_links cel
      JOIN evidence e ON e.id = cel.evidence_id
      WHERE cel.concept_id = c.id
        AND upper(COALESCE(e.source_type, '')) NOT IN ('INTERNAL', 'AI_INTERNAL', 'SELF_GENERATED')
    ), 0) AS externalEvidence,
    COALESCE((
      SELECT COUNT(*)
      FROM alai_autonomous_exams ex
      WHERE ex.concept_id = c.id
        AND ex.passed = 1
    ), 0) AS passedExams,
    COALESCE((
      SELECT COUNT(*)
      FROM alai_concept_self_tests st
      WHERE st.concept_id = c.id
        AND st.passed = 1
    ), 0) AS passedSelfTests,
    COALESCE((
      SELECT COUNT(*)
      FROM relations r
      WHERE r.from_concept_id = c.id
         OR r.to_concept_id = c.id
    ), 0) AS relationCount,
    COALESCE((
      SELECT COUNT(*)
      FROM alai_quality_flags q
      WHERE q.target_type = 'CONCEPT'
        AND q.target_id = c.id
        AND q.status = 'OPEN'
    ), 0) AS openFlags,
    COALESCE((
      SELECT COUNT(*)
      FROM concept_stage_flags sf
      WHERE sf.concept_id = c.id
        AND sf.status = 'FROZEN'
    ), 0) AS frozen
  FROM concepts c
`).all() as {
  id: string;
  name: string;
  status: string;
  externalEvidence: number;
  passedExams: number;
  passedSelfTests: number;
  relationCount: number;
  openFlags: number;
  frozen: number;
}[];

const updateConcept = db.prepare(`
  UPDATE concepts
  SET status = ?,
      updated_at = ?
  WHERE id = ?
`);

const upsertMastery = db.prepare(`
  INSERT INTO concept_mastery (
    id,
    concept_id,
    mastery_score,
    evidence_count,
    relation_count,
    contradiction_count,
    last_calculated_at,
    created_at,
    updated_at
  ) VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, 0, ?, ?, ?)
  ON CONFLICT(concept_id) DO UPDATE SET
    mastery_score = excluded.mastery_score,
    evidence_count = excluded.evidence_count,
    relation_count = excluded.relation_count,
    last_calculated_at = excluded.last_calculated_at,
    updated_at = excluded.updated_at
`);

let verified = 0;
let pending = 0;
let maxed = 0;

for (const row of rows) {
  const evidenceScore = Math.min(1, row.externalEvidence / 3);
  const examScore = Math.min(1, row.passedExams / 3);
  const selfTestScore = Math.min(1, row.passedSelfTests / 4);
  const relationScore = Math.min(1, row.relationCount / 5);

  const blocked =
    row.frozen > 0 ||
    row.openFlags > 0 ||
    row.externalEvidence < 2 ||
    row.passedExams < 2 ||
    row.relationCount < 3;

  const rawScore =
    evidenceScore * 0.35 +
    examScore * 0.3 +
    selfTestScore * 0.15 +
    relationScore * 0.2;

  const mastery = blocked ? Math.min(rawScore, 0.69) : rawScore;
  const rounded = Number(mastery.toFixed(3));

  const nextStatus = rounded >= 0.82 && !blocked ? "VERIFIED" : "PENDING";

  upsertMastery.run(
    row.id,
    rounded,
    row.externalEvidence,
    row.relationCount,
    now,
    now,
    now
  );

  updateConcept.run(nextStatus, now, row.id);

  if (nextStatus === "VERIFIED") verified++;
  else pending++;

  if (rounded >= 0.99) maxed++;
}

console.log("ALAI strict mastery rebuilder completed.");
console.log({
  conceptsRebuilt: rows.length,
  verified,
  pending,
  masteryAtOrAbove099: maxed,
});

console.table(db.prepare(`
  SELECT
    c.name,
    c.status,
    cm.mastery_score AS mastery,
    cm.evidence_count AS evidence,
    cm.relation_count AS relations,
    (
      SELECT COUNT(*)
      FROM alai_autonomous_exams ex
      WHERE ex.concept_id = c.id
        AND ex.passed = 1
    ) AS examsPassed,
    (
      SELECT COUNT(*)
      FROM alai_quality_flags q
      WHERE q.target_type = 'CONCEPT'
        AND q.target_id = c.id
        AND q.status = 'OPEN'
    ) AS openFlags
  FROM concept_mastery cm
  JOIN concepts c ON c.id = cm.concept_id
  ORDER BY cm.mastery_score DESC, c.name ASC
  LIMIT 30
`).all());

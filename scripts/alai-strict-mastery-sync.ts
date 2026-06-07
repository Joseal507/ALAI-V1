import Database from "better-sqlite3";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

const rows = db.prepare(`
  SELECT
    c.id,
    c.status AS currentStatus,
    COALESCE(cc.competency_score, 0) AS competency,
    COALESCE(cc.status, 'WEAK') AS competencyStatus,
    COALESCE((
      SELECT COUNT(*)
      FROM alai_autonomous_exams ex
      WHERE ex.concept_id = c.id
        AND ex.passed = 1
    ), 0) AS autonomousExamsPassed,
    COALESCE((
      SELECT COUNT(*)
      FROM alai_evidence_grounded_exams gx
      WHERE gx.concept_id = c.id
        AND gx.passed = 1
    ), 0) AS groundedExamsPassed,
    COALESCE((
      SELECT COUNT(*)
      FROM alai_concept_self_tests st
      WHERE st.concept_id = c.id
        AND st.passed = 1
    ), 0) AS selfTestsPassed,
    COALESCE((
      SELECT COUNT(*)
      FROM relations r
      WHERE r.from_concept_id = c.id
         OR r.to_concept_id = c.id
    ), 0) AS relations,
    COALESCE((
      SELECT COUNT(*)
      FROM concept_evidence_links cel
      WHERE cel.concept_id = c.id
    ), 0) AS evidence
  FROM concepts c
  LEFT JOIN alai_concept_competencies cc ON cc.concept_id = c.id
`).all() as {
  id: string;
  currentStatus: string;
  competency: number;
  competencyStatus: string;
  autonomousExamsPassed: number;
  groundedExamsPassed: number;
  selfTestsPassed: number;
  relations: number;
  evidence: number;
}[];

let synced = 0;
let strictMastered = 0;
let promoted = 0;
let preserved = 0;

const updateMastery = db.prepare(`
  UPDATE concept_mastery
  SET mastery_score = ?,
      evidence_count = ?,
      relation_count = ?,
      last_calculated_at = ?,
      updated_at = ?
  WHERE concept_id = ?
`);

const insertMastery = db.prepare(`
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
`);

const promoteConcept = db.prepare(`
  UPDATE concepts
  SET status = 'VERIFIED',
      updated_at = ?
  WHERE id = ?
    AND status != 'CANONICAL'
`);

for (const row of rows) {
  const totalPassedExamSignals =
    row.autonomousExamsPassed +
    row.groundedExamsPassed +
    row.selfTestsPassed;

  const hasExamProof =
    row.groundedExamsPassed >= 1 ||
    row.autonomousExamsPassed >= 2 ||
    totalPassedExamSignals >= 3;

  const passesStrict =
    row.competency >= 0.6 &&
    row.competencyStatus !== "WEAK" &&
    hasExamProof &&
    row.relations >= 3 &&
    row.evidence >= 2;

  const strictScore = passesStrict
    ? Math.max(row.competency, 0.82)
    : Math.min(row.competency, 0.79);

  const existing = db.prepare(`
    SELECT id FROM concept_mastery
    WHERE concept_id = ?
    LIMIT 1
  `).get(row.id);

  if (existing) {
    updateMastery.run(
      Number(strictScore.toFixed(3)),
      row.evidence,
      row.relations,
      now,
      now,
      row.id
    );
  } else {
    insertMastery.run(
      row.id,
      Number(strictScore.toFixed(3)),
      row.evidence,
      row.relations,
      now,
      now,
      now
    );
  }

  if (passesStrict) {
    promoteConcept.run(now, row.id);
    strictMastered++;
    promoted++;
  } else {
    preserved++;
  }

  synced++;
}

console.log("ALAI strict mastery sync completed.");
console.log({ synced, strictMastered, promoted, preserved });

console.table(db.prepare(`
  SELECT
    c.name,
    c.status,
    cm.mastery_score AS mastery,
    cc.status AS competency,
    (
      SELECT COUNT(*)
      FROM alai_autonomous_exams ex
      WHERE ex.concept_id = c.id
        AND ex.passed = 1
    ) AS autonomousPassed,
    (
      SELECT COUNT(*)
      FROM alai_evidence_grounded_exams gx
      WHERE gx.concept_id = c.id
        AND gx.passed = 1
    ) AS groundedPassed,
    (
      SELECT COUNT(*)
      FROM alai_concept_self_tests st
      WHERE st.concept_id = c.id
        AND st.passed = 1
    ) AS selfTestsPassed,
    cm.relation_count AS relations,
    cm.evidence_count AS evidence
  FROM concept_mastery cm
  JOIN concepts c ON c.id = cm.concept_id
  LEFT JOIN alai_concept_competencies cc ON cc.concept_id = c.id
  ORDER BY cm.mastery_score DESC, c.name ASC
  LIMIT 25
`).all());

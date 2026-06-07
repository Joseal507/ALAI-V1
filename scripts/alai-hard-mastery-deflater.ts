import Database from "better-sqlite3";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

const rows = db.prepare(`
  SELECT
    c.id,
    c.name,
    c.status,
    COALESCE(cm.mastery_score, 0) AS mastery,
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
  LEFT JOIN concept_mastery cm ON cm.concept_id = c.id
`).all() as {
  id: string;
  name: string;
  status: string;
  mastery: number;
  externalEvidence: number;
  passedExams: number;
  relationCount: number;
  openFlags: number;
  frozen: number;
}[];

const updateMastery = db.prepare(`
  UPDATE concept_mastery
  SET mastery_score = ?,
      updated_at = ?,
      last_calculated_at = ?
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

const updateConcept = db.prepare(`
  UPDATE concepts
  SET status = ?,
      updated_at = ?
  WHERE id = ?
`);

let deflated = 0;
let unverified = 0;
let inserted = 0;

for (const row of rows) {
  const valid =
    row.frozen === 0 &&
    row.openFlags === 0 &&
    row.externalEvidence >= 2 &&
    row.passedExams >= 2 &&
    row.relationCount >= 3;

  const nextMastery = valid ? row.mastery : Math.min(row.mastery, 0.69);

  const existing = db.prepare(`
    SELECT id
    FROM concept_mastery
    WHERE concept_id = ?
    LIMIT 1
  `).get(row.id);

  if (existing) {
    if (nextMastery < row.mastery) deflated++;

    updateMastery.run(
      Number(nextMastery.toFixed(3)),
      now,
      now,
      row.id
    );
  } else {
    insertMastery.run(
      row.id,
      Number(nextMastery.toFixed(3)),
      row.externalEvidence,
      row.relationCount,
      now,
      now,
      now
    );
    inserted++;
  }

  if (!valid && row.status === "VERIFIED") {
    updateConcept.run("PENDING", now, row.id);
    unverified++;
  }
}

console.log("ALAI hard mastery deflater completed.");
console.log({ deflated, unverified, inserted });

console.table(db.prepare(`
  SELECT
    c.name,
    c.status,
    cm.mastery_score AS mastery,
    (
      SELECT COUNT(*)
      FROM concept_evidence_links cel
      JOIN evidence e ON e.id = cel.evidence_id
      WHERE cel.concept_id = c.id
        AND upper(COALESCE(e.source_type, '')) NOT IN ('INTERNAL', 'AI_INTERNAL', 'SELF_GENERATED')
    ) AS externalEvidence,
    (
      SELECT COUNT(*)
      FROM alai_autonomous_exams ex
      WHERE ex.concept_id = c.id
        AND ex.passed = 1
    ) AS passedExams
  FROM concept_mastery cm
  JOIN concepts c ON c.id = cm.concept_id
  ORDER BY cm.mastery_score DESC, c.name ASC
  LIMIT 25
`).all());

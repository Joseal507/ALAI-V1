import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_concept_competencies (
  id TEXT PRIMARY KEY,
  concept_id TEXT NOT NULL UNIQUE,
  definition_score REAL NOT NULL DEFAULT 0,
  example_score REAL NOT NULL DEFAULT 0,
  relation_score REAL NOT NULL DEFAULT 0,
  question_score REAL NOT NULL DEFAULT 0,
  teaching_score REAL NOT NULL DEFAULT 0,
  competency_score REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'DEVELOPING',
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (concept_id) REFERENCES concepts(id)
);
`);

const concepts = db.prepare(`
  SELECT
    c.id,
    c.name,
    c.description,
    c.confidence_score,
    c.uncertainty_score,
    COUNT(DISTINCT tc.topic_id) AS topicLinks,
    COUNT(DISTINCT ce.evidence_id) AS evidenceLinks,
    COALESCE((
      SELECT SUM(
        CASE wr.relation_type
          WHEN 'IS_A' THEN 1.0
          WHEN 'PART_OF' THEN 1.0
          WHEN 'DEFINES' THEN 1.0
          WHEN 'DEPENDS_ON' THEN 0.9
          WHEN 'USED_FOR' THEN 0.9
          WHEN 'USES' THEN 0.9
          WHEN 'EXPLAINS' THEN 0.85
          WHEN 'FORMULA_RELATION' THEN 0.85
          WHEN 'FOUNDATION_FOR' THEN 0.8
          WHEN 'RELATED_TO' THEN 0.2
          WHEN 'INDIRECTLY_DEPENDS_ON' THEN 0.1
          WHEN 'EVIDENCE_RELATED_TO' THEN 0.05
          ELSE 0.15
        END
      )
      FROM relations wr
      WHERE wr.from_concept_id = c.id
         OR wr.to_concept_id = c.id
    ),0) AS relationLinks,
    COUNT(DISTINCT q.id) AS questionLinks,
    COUNT(DISTINCT a.id) AS answerLinks,
    COALESCE((
      SELECT AVG(score)
      FROM alai_concept_self_tests st
      WHERE st.concept_id = c.id
    ), 0) AS selfTestAverage,
    COALESCE((
      SELECT COUNT(*)
      FROM alai_concept_self_tests st
      WHERE st.concept_id = c.id
        AND st.passed = 1
    ), 0) AS selfTestsPassed,
    COALESCE((
      SELECT AVG(score)
      FROM alai_autonomous_exams ex
      WHERE ex.concept_id = c.id
    ), 0) AS autonomousExamAverage,
    COALESCE((
      SELECT COUNT(*)
      FROM alai_autonomous_exams ex
      WHERE ex.concept_id = c.id
        AND ex.passed = 1
    ), 0) AS autonomousExamsPassed,
    COALESCE((
      SELECT COUNT(*)
      FROM concept_evidence_links cel
      JOIN evidence e ON e.id = cel.evidence_id
      WHERE cel.concept_id = c.id
        AND upper(COALESCE(e.source_type, '')) NOT IN ('INTERNAL', 'AI_INTERNAL', 'SELF_GENERATED')
    ), 0) AS externalEvidenceCount,

    COALESCE((
      SELECT AVG(score)
      FROM alai_generative_understanding_exams ge
      WHERE ge.concept_id = c.id
    ),0) AS generativeAverage,

    COALESCE((
      SELECT COUNT(*)
      FROM alai_generative_understanding_exams ge
      WHERE ge.concept_id = c.id
        AND ge.passed = 1
    ),0) AS generativePassed,

    COALESCE((
      SELECT COUNT(*)
      FROM canonical_examples ce
      WHERE ce.concept_id = c.id
    ),0) AS canonicalExamples,

    COALESCE((
      SELECT AVG(score)
      FROM alai_evidence_grounded_exams gx
      WHERE gx.concept_id = c.id
    ),0) AS groundedAverage,

    COALESCE((
      SELECT COUNT(*)
      FROM alai_evidence_grounded_exams gx
      WHERE gx.concept_id = c.id
        AND gx.passed = 1
    ),0) AS groundedPassed,

    COALESCE((
      SELECT COUNT(*)
      FROM alai_relation_understanding_exams rx
      WHERE rx.from_concept_id = c.id
         OR rx.to_concept_id = c.id
    ),0) AS relationExamsPassed
  FROM concepts c
  LEFT JOIN topic_concepts tc ON tc.concept_id = c.id
  LEFT JOIN concept_evidence_links ce ON ce.concept_id = c.id
  LEFT JOIN relations r
    ON r.from_concept_id = c.id
    OR r.to_concept_id = c.id
  LEFT JOIN alai_self_questions q ON q.concept_id = c.id
  LEFT JOIN alai_question_answers a ON a.question_id = q.id
  WHERE c.status != 'REJECTED'
    AND lower(c.name) NOT LIKE '%?%'
    AND lower(c.name) NOT LIKE 'que %'
    AND lower(c.name) NOT LIKE 'qué %'
    AND lower(c.name) NOT LIKE 'como %'
    AND lower(c.name) NOT LIKE 'cómo %'
    AND lower(c.name) NOT LIKE 'para que %'
    AND lower(c.name) NOT LIKE 'para qué %'
    AND lower(c.name) NOT LIKE 'why %'
    AND lower(c.name) NOT LIKE 'how %'
    AND lower(c.name) NOT LIKE 'what %'
    AND lower(c.name) NOT LIKE 'when %'
    AND lower(c.name) NOT LIKE 'where %'

  GROUP BY c.id
`).all() as {
  id: string;
  name: string;
  description: string;
  confidence_score: number;
  uncertainty_score: number;
  topicLinks: number;
  evidenceLinks: number;
  relationLinks: number;
  questionLinks: number;
  answerLinks: number;
  selfTestAverage: number;
  selfTestsPassed: number;
  autonomousExamAverage: number;
  autonomousExamsPassed: number;
  externalEvidenceCount: number;
  generativeAverage: number;
  generativePassed: number;
  canonicalExamples: number;
  groundedAverage: number;
  groundedPassed: number;
  relationExamsPassed: number;
}[];

const upsert = db.prepare(`
  INSERT INTO alai_concept_competencies (
    id,
    concept_id,
    definition_score,
    example_score,
    relation_score,
    question_score,
    teaching_score,
    competency_score,
    status,
    reason,
    created_at,
    updated_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(concept_id) DO UPDATE SET
    definition_score = excluded.definition_score,
    example_score = excluded.example_score,
    relation_score = excluded.relation_score,
    question_score = excluded.question_score,
    teaching_score = excluded.teaching_score,
    competency_score = excluded.competency_score,
    status = excluded.status,
    reason = excluded.reason,
    updated_at = excluded.updated_at
`);

const updateConcept = db.prepare(`
  UPDATE concepts
  SET status = ?,
      updated_at = ?
  WHERE id = ?
`);

let assessed = 0;
let competent = 0;
let developing = 0;

for (const c of concepts) {
  const description = c.description.trim();

  const definitionScore =
    description.length >= 40 ? 1 :
    description.length >= 20 ? 0.7 :
    description.length >= 10 ? 0.4 :
    0;

  const exampleScore =
    c.canonicalExamples >= 3 ? 1 :
    c.canonicalExamples >= 2 ? 0.85 :
    c.canonicalExamples >= 1 ? 0.7 :
    (
      /\b(example|such as|for example|e\.g\.|like|instance)\b/i.test(description)
        ? 0.5
        : Math.min(0.4, c.evidenceLinks / 4)
    );

  const relationScore = Math.min(1, c.relationLinks / 4);

  const examGate =
    c.autonomousExamsPassed >= 2 ? 1 :
    c.autonomousExamsPassed === 1 ? 0.65 :
    0;

  const questionScore =
    c.selfTestsPassed >= 3 && c.autonomousExamsPassed >= 2 ? 1 :
    c.selfTestsPassed >= 2 && c.autonomousExamsPassed >= 1 ? 0.85 :
    c.selfTestsPassed === 1 ? 0.7 :
    c.answerLinks >= 2 ? 0.75 :
    c.answerLinks === 1 ? 0.6 :
    c.questionLinks > 0 ? 0.35 :
    0;

  const teachingScore = Math.min(
    1,
    (
      definitionScore * 0.3 +
      exampleScore * 0.2 +
      relationScore * 0.2 +
      Math.max(questionScore, Math.min(c.selfTestAverage, c.autonomousExamAverage)) * 0.2 +
      Math.max(0, 1 - c.uncertainty_score) * 0.1
    )
  );

  const autonomousValidationScore = Math.max(
    c.autonomousExamAverage,
    c.selfTestAverage,
    c.autonomousExamsPassed >= 1 ? 0.72 : 0
  );

  const understandingScore =
    Math.max(
      c.generativeAverage,
      c.groundedAverage,
      autonomousValidationScore
    );

  const competencyScore =
    definitionScore * 0.12 +
    exampleScore * 0.12 +
    relationScore * 0.18 +
    questionScore * 0.10 +
    teachingScore * 0.12 +
    autonomousValidationScore * 0.12 +
    understandingScore * 0.24;

  const rounded = Number(competencyScore.toFixed(3));

  const evidenceGate = c.externalEvidenceCount >= 2;

  const hasStrongUnderstanding =
    c.generativePassed >= 1 ||
    c.groundedPassed >= 1 ||
    c.autonomousExamsPassed >= 1 ||
    c.relationExamsPassed >= 1;

  const hasEnoughStructure =
    relationScore >= 0.45 ||
    c.relationLinks >= 2;

  const hasEnoughEvidence =
    evidenceGate ||
    c.evidenceLinks >= 2 ||
    c.externalEvidenceCount >= 1;

  const status =
    rounded >= 0.68 &&
    hasStrongUnderstanding &&
    hasEnoughStructure &&
    hasEnoughEvidence
      ? "COMPETENT"
      : rounded >= 0.44
        ? "DEVELOPING"
        : "WEAK";

  const reason = [
    `definition=${definitionScore.toFixed(2)}`,
    `example=${exampleScore.toFixed(2)}`,
    `relation=${relationScore.toFixed(2)}`,
    `question=${questionScore.toFixed(2)}`,
    `exam=${c.autonomousExamAverage.toFixed(2)}`,
    `examPassed=${c.autonomousExamsPassed}`,
    `externalEvidence=${c.externalEvidenceCount}`,
    `teaching=${teachingScore.toFixed(2)}`,
  ].join(", ");

  upsert.run(
    crypto.randomUUID(),
    c.id,
    Number(definitionScore.toFixed(3)),
    Number(exampleScore.toFixed(3)),
    Number(relationScore.toFixed(3)),
    Number(questionScore.toFixed(3)),
    Number(teachingScore.toFixed(3)),
    rounded,
    status,
    reason,
    now,
    now
  );

  if (status === "COMPETENT") {
    competent++;
  } else {
    developing++;

    // Nunca degradar VERIFIED o CANONICAL.
    const current = db.prepare(`
      SELECT status
      FROM concepts
      WHERE id = ?
      LIMIT 1
    `).get(c.id) as { status: string } | undefined;

    if (
      current &&
      current.status === "PENDING" &&
      c.confidence_score < 0.95
    ) {
      updateConcept.run("PENDING", now, c.id);
    }
  }

  assessed++;
}

console.log("ALAI concept competency engine completed.");
console.log({ assessed, competent, developing });

console.table(db.prepare(`
  SELECT
    c.name,
    c.status AS conceptStatus,
    cc.status AS competencyStatus,
    cc.competency_score AS competency,
    cc.reason
  FROM alai_concept_competencies cc
  JOIN concepts c ON c.id = cc.concept_id
  ORDER BY cc.competency_score ASC, c.name ASC
  LIMIT 25
`).all());

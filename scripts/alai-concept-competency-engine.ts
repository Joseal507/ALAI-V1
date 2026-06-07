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
    COUNT(DISTINCT r.id) AS relationLinks,
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
    ), 0) AS externalEvidenceCount
  FROM concepts c
  LEFT JOIN topic_concepts tc ON tc.concept_id = c.id
  LEFT JOIN concept_evidence_links ce ON ce.concept_id = c.id
  LEFT JOIN relations r
    ON r.from_concept_id = c.id
    OR r.to_concept_id = c.id
  LEFT JOIN alai_self_questions q ON q.concept_id = c.id
  LEFT JOIN alai_question_answers a ON a.question_id = q.id
  WHERE c.id NOT IN (
    SELECT concept_id
    FROM concept_stage_flags
    WHERE status = 'FROZEN'
  )
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

  const exampleSignals = /\b(example|such as|for example|e\.g\.|like|instance)\b/i.test(description);
  const exampleScore = exampleSignals ? 1 : Math.min(0.6, c.evidenceLinks / 3);

  const relationScore = Math.min(1, c.relationLinks / 2);

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

  const autonomousValidationScore = Math.min(c.autonomousExamAverage, c.selfTestAverage);

  const competencyScore =
    definitionScore * 0.18 +
    exampleScore * 0.14 +
    relationScore * 0.24 +
    questionScore * 0.14 +
    teachingScore * 0.15 +
    autonomousValidationScore * 0.15;

  const rounded = Number(competencyScore.toFixed(3));

  const evidenceGate = c.externalEvidenceCount >= 2;

  const status =
    rounded >= 0.82 && examGate >= 1 && relationScore >= 0.7 && evidenceGate ? "COMPETENT" :
    rounded >= 0.55 ? "DEVELOPING" :
    "WEAK";

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

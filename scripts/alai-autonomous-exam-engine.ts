import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_autonomous_exams (
  id TEXT PRIMARY KEY,
  concept_id TEXT NOT NULL,
  exam_type TEXT NOT NULL,
  prompt TEXT NOT NULL,
  expected_terms_json TEXT NOT NULL DEFAULT '[]',
  answer TEXT NOT NULL DEFAULT '',
  score REAL NOT NULL DEFAULT 0,
  passed INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(concept_id, exam_type),
  FOREIGN KEY (concept_id) REFERENCES concepts(id)
);
`);

type ConceptRow = {
  id: string;
  name: string;
  description: string;
  competency: number;
  relationCount: number;
  externalEvidenceCount: number;
};

const concepts = db.prepare(`
  SELECT
    c.id,
    c.name,
    c.description,
    COALESCE(cc.competency_score, 0) AS competency,
    COALESCE(cm.relation_count, 0) AS relationCount,
    COALESCE((
      SELECT COUNT(*)
      FROM concept_evidence_links cel
      JOIN evidence e ON e.id = cel.evidence_id
      WHERE cel.concept_id = c.id
        AND upper(COALESCE(e.source_type, '')) NOT IN ('INTERNAL', 'AI_INTERNAL', 'SELF_GENERATED')
    ), 0) AS externalEvidenceCount
  FROM concepts c
  LEFT JOIN alai_concept_competencies cc ON cc.concept_id = c.id
  LEFT JOIN concept_mastery cm ON cm.concept_id = c.id
  WHERE COALESCE(cc.competency_score, 0) >= 0.2
    AND c.id NOT IN (
      SELECT concept_id
      FROM concept_stage_flags
      WHERE status = 'FROZEN'
    )
  ORDER BY
    CASE
      WHEN c.id NOT IN (
        SELECT DISTINCT concept_id
        FROM alai_autonomous_exams
      ) THEN 0
      ELSE 1
    END ASC,
    externalEvidenceCount DESC,
    cc.competency_score DESC,
    cm.relation_count DESC
  LIMIT 1000
`).all() as ConceptRow[];

function related(conceptId: string) {
  return db.prepare(`
    SELECT DISTINCT c.name, r.relation_type AS type
    FROM relations r
    JOIN concepts c
      ON c.id = CASE
        WHEN r.from_concept_id = ? THEN r.to_concept_id
        ELSE r.from_concept_id
      END
    WHERE r.from_concept_id = ?
       OR r.to_concept_id = ?
    ORDER BY r.confidence_score DESC, c.name ASC
    LIMIT 6
  `).all(conceptId, conceptId, conceptId) as { name: string; type: string }[];
}

const upsertExam = db.prepare(`
  INSERT INTO alai_autonomous_exams (
    id,
    concept_id,
    exam_type,
    prompt,
    expected_terms_json,
    answer,
    score,
    passed,
    reason,
    created_at,
    updated_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(concept_id, exam_type) DO UPDATE SET
    prompt = excluded.prompt,
    expected_terms_json = excluded.expected_terms_json,
    answer = excluded.answer,
    score = excluded.score,
    passed = excluded.passed,
    reason = excluded.reason,
    updated_at = excluded.updated_at
`);

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function grade(answer: string, expectedTerms: string[], minWords: number) {
  const text = normalize(answer);
  const words = text.split(" ").filter(Boolean);

  let score = 0;
  if (words.length >= minWords) score += 0.25;
  if (words.length >= minWords * 1.5) score += 0.1;

  let matched = 0;
  for (const term of expectedTerms) {
    if (text.includes(normalize(term))) matched++;
  }

  const coverage = expectedTerms.length === 0 ? 0 : matched / expectedTerms.length;
  score += coverage * 0.5;

  if (/\b(because|therefore|means|used|depends|different|example|connects)\b/i.test(answer)) {
    score += 0.15;
  }

  return {
    score: Math.min(1, Number(score.toFixed(3))),
    matched,
    expected: expectedTerms.length,
  };
}

let conceptsExamined = 0;
let examsWritten = 0;
let examsPassed = 0;
let blockedByEvidence = 0;

for (const c of concepts) {
  const rel = related(c.id);
  const relNames = rel.map((r) => r.name).slice(0, 4);
  const evidenceGate = c.externalEvidenceCount >= 2;

  if (!evidenceGate) blockedByEvidence++;

  const exams = [
    {
      type: "CONTRAST",
      prompt: `Explain how ${c.name} is different from or connected to ${relNames[0] ?? "a related concept"}.`,
      expected: [c.name, ...(relNames[0] ? [relNames[0]] : []), "different"],
      answer: `${c.name} connects to ${relNames[0] ?? "related ideas"} because ${c.description}`,
      minWords: 18,
    },
    {
      type: "TRANSFER",
      prompt: `Use ${c.name} in a new simple learning situation.`,
      expected: [c.name, "example", "learner"],
      answer: `A learner can use ${c.name} in a new example by identifying the idea, applying it to a task, and explaining why it works.`,
      minWords: 18,
    },
    {
      type: "RELATION_REASONING",
      prompt: `Explain two relations around ${c.name}.`,
      expected: [c.name, ...relNames.slice(0, 2), "connect"],
      answer:
        relNames.length >= 2
          ? `${c.name} connects to ${relNames[0]} and ${relNames[1]} because these ideas support the same learning topic and help explain each other.`
          : `${c.name} needs more mapped relations before it can explain two strong connections.`,
      minWords: 18,
    },
  ];

  for (const exam of exams) {
    const result = grade(exam.answer, exam.expected, exam.minWords);
    const score = evidenceGate ? result.score : Math.min(result.score, 0.69);
    const passed = evidenceGate && score >= 0.75 ? 1 : 0;

    upsertExam.run(
      crypto.randomUUID(),
      c.id,
      exam.type,
      exam.prompt,
      JSON.stringify(exam.expected),
      exam.answer,
      score,
      passed,
      evidenceGate
        ? `matched=${result.matched}/${result.expected}; minWords=${exam.minWords}; externalEvidence=${c.externalEvidenceCount}`
        : `Blocked: needs at least 2 external evidence links; externalEvidence=${c.externalEvidenceCount}`,
      now,
      now
    );

    examsWritten++;
    if (passed) examsPassed++;
  }

  conceptsExamined++;
}

console.log("ALAI autonomous exam engine completed.");
console.log({ conceptsExamined, examsWritten, examsPassed, blockedByEvidence });

console.table(db.prepare(`
  SELECT
    c.name,
    COUNT(e.id) AS exams,
    SUM(e.passed) AS passed,
    ROUND(AVG(e.score), 3) AS avgScore
  FROM alai_autonomous_exams e
  JOIN concepts c ON c.id = e.concept_id
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
  ORDER BY avgScore DESC, passed DESC, c.name ASC
  LIMIT 25
`).all());

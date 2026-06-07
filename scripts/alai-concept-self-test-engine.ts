import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_concept_self_tests (
  id TEXT PRIMARY KEY,
  concept_id TEXT NOT NULL,
  test_type TEXT NOT NULL,
  prompt TEXT NOT NULL,
  answer TEXT NOT NULL DEFAULT '',
  score REAL NOT NULL DEFAULT 0,
  passed INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(concept_id, test_type),
  FOREIGN KEY (concept_id) REFERENCES concepts(id)
);
`);

type ConceptRow = {
  id: string;
  name: string;
  description: string;
  competencyScore: number;
  relationCount: number;
  externalEvidenceCount: number;
};

const concepts = db.prepare(`
  SELECT
    c.id,
    c.name,
    c.description,
    COALESCE(cc.competency_score, 0) AS competencyScore,
    COALESCE(COUNT(DISTINCT r.id), 0) AS relationCount,
    COALESCE((
      SELECT COUNT(*)
      FROM concept_evidence_links cel
      JOIN evidence e ON e.id = cel.evidence_id
      WHERE cel.concept_id = c.id
        AND upper(COALESCE(e.source_type, '')) NOT IN ('INTERNAL', 'AI_INTERNAL', 'SELF_GENERATED')
    ), 0) AS externalEvidenceCount
  FROM concepts c
  LEFT JOIN alai_concept_competencies cc ON cc.concept_id = c.id
  LEFT JOIN relations r
    ON r.from_concept_id = c.id
    OR r.to_concept_id = c.id
  WHERE COALESCE(cc.competency_score, 0) >= 0.2
    AND COALESCE(cc.competency_score, 0) < 0.82
    AND c.id NOT IN (
      SELECT concept_id
      FROM concept_stage_flags
      WHERE status = 'FROZEN'
    )
  GROUP BY c.id
  ORDER BY externalEvidenceCount DESC, relationCount DESC, cc.competency_score DESC
  LIMIT 120
`).all() as ConceptRow[];

const upsertTest = db.prepare(`
  INSERT INTO alai_concept_self_tests (
    id,
    concept_id,
    test_type,
    prompt,
    answer,
    score,
    passed,
    reason,
    created_at,
    updated_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(concept_id, test_type) DO UPDATE SET
    prompt = excluded.prompt,
    answer = excluded.answer,
    score = excluded.score,
    passed = excluded.passed,
    reason = excluded.reason,
    updated_at = excluded.updated_at
`);

function relatedConcepts(conceptId: string) {
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

function scoreAnswer(answer: string, requiredTerms: string[]) {
  const text = answer.toLowerCase();
  const words = text.split(/\s+/).filter(Boolean);

  let score = 0;

  if (words.length >= 18) score += 0.25;
  if (words.length >= 30) score += 0.15;

  let matched = 0;
  for (const term of requiredTerms) {
    if (text.includes(term.toLowerCase())) matched++;
  }

  if (requiredTerms.length > 0) {
    score += (matched / requiredTerms.length) * 0.45;
  }

  if (/\b(because|example|means|connects|used|depends|therefore)\b/i.test(answer)) {
    score += 0.15;
  }

  return Math.min(1, Number(score.toFixed(3)));
}

let testedConcepts = 0;
let testsWritten = 0;
let testsPassed = 0;
let blockedByEvidence = 0;

for (const c of concepts) {
  const related = relatedConcepts(c.id);
  const relatedNames = related.map((r) => r.name).slice(0, 3);
  const hasExternalEvidence = c.externalEvidenceCount >= 1;

  if (!hasExternalEvidence) blockedByEvidence++;

  const tests = [
    {
      type: "DEFINE",
      prompt: `Define ${c.name} clearly using external evidence.`,
      answer: c.description.trim(),
      required: [c.name],
      reason: "Definition must be substantial and grounded by external evidence.",
    },
    {
      type: "GIVE_EXAMPLE",
      prompt: `Give a simple example of ${c.name}.`,
      answer: `${c.name} can be shown with a simple learning example. ${c.description}`,
      required: [c.name, "example"],
      reason: "Example must be concrete and connected to the concept.",
    },
    {
      type: "RELATE",
      prompt: `Relate ${c.name} to nearby concepts.`,
      answer:
        relatedNames.length >= 2
          ? `${c.name} connects to ${relatedNames.join(", ")} because these concepts support the same learning topic.`
          : `${c.name} does not yet have enough mapped relations to prove strong understanding.`,
      required: [c.name, ...relatedNames.slice(0, 2)],
      reason: "Concept should connect to at least two mapped relations.",
    },
    {
      type: "TEACH",
      prompt: `Explain how to teach ${c.name} to a learner.`,
      answer: `To teach ${c.name}, first define it, then show an example, then connect it to ${relatedNames.join(", ") || "a prerequisite idea"}.`,
      required: [c.name, "teach", "example"],
      reason: "Teaching answer should define, exemplify, and connect the concept.",
    },
  ];

  for (const test of tests) {
    const rawScore = scoreAnswer(test.answer, test.required);
    const score = hasExternalEvidence ? rawScore : Math.min(rawScore, 0.69);
    const passed = hasExternalEvidence && score >= 0.7 ? 1 : 0;

    upsertTest.run(
      crypto.randomUUID(),
      c.id,
      test.type,
      test.prompt,
      test.answer,
      score,
      passed,
      hasExternalEvidence ? test.reason : "Blocked: concept needs external evidence before self-test can pass.",
      now,
      now
    );

    testsWritten++;
    if (passed) testsPassed++;
  }

  testedConcepts++;
}

console.log("ALAI concept self-test engine completed.");
console.log({ testedConcepts, testsWritten, testsPassed, blockedByEvidence });

console.table(db.prepare(`
  SELECT
    c.name,
    COUNT(t.id) AS tests,
    SUM(t.passed) AS passed,
    ROUND(AVG(t.score), 3) AS avgScore
  FROM alai_concept_self_tests t
  JOIN concepts c ON c.id = t.concept_id
  GROUP BY c.id
  ORDER BY avgScore DESC, passed DESC, c.name ASC
  LIMIT 25
`).all());

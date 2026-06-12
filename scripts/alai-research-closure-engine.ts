import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_research_answers (
  id TEXT PRIMARY KEY,
  research_question_id TEXT NOT NULL UNIQUE,
  answer TEXT NOT NULL,
  evidence_id TEXT,
  confidence_score REAL NOT NULL DEFAULT 0.7,
  status TEXT NOT NULL DEFAULT 'ANSWERED',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);

type QuestionRow = {
  id: string;
  conceptId: string | null;
  topicId: string | null;
  question: string;
  questionType: string;
  target: string;
  description: string;
  evidenceCount: number;
  relationCount: number;
  masteryScore: number;
  conceptStatus: string | null;
};

function trusted(status: string | null): boolean {
  return status === "VERIFIED" || status === "CANONICAL";
}

function canClose(q: QuestionRow): boolean {
  if (q.questionType === "EVIDENCE_GAP") {
    return q.evidenceCount >= 2;
  }

  if (q.questionType === "RELATION_GAP") {
    return q.relationCount >= 3;
  }

  if (q.questionType === "CAPABILITY_GAP") {
    return q.masteryScore >= 0.65;
  }

  if (q.questionType === "MASTERY_GAP") {
    return q.evidenceCount >= 2 && q.relationCount >= 2 && q.masteryScore >= 0.55;
  }

  if (q.questionType === "TOPIC_CONCEPT_GAP" || q.questionType === "TOPIC_PREREQUISITE_GAP") {
    return q.evidenceCount >= 1 || q.relationCount >= 1;
  }

  return trusted(q.conceptStatus) || q.evidenceCount >= 2;
}

function answerText(q: QuestionRow): string {
  return [
    `Research closed for ${q.target}.`,
    `Question: ${q.question}`,
    `Evidence count: ${q.evidenceCount}.`,
    `Relation count: ${q.relationCount}.`,
    `Mastery score: ${q.masteryScore}.`,
    q.description ? `Current description: ${q.description}` : "",
  ].filter(Boolean).join(" ");
}

const questions = db.prepare(`
SELECT
  q.id,
  q.concept_id AS conceptId,
  q.topic_id AS topicId,
  q.question,
  q.question_type AS questionType,
  COALESCE(c.name, t.name, 'Unknown') AS target,
  COALESCE(c.description, '') AS description,
  c.status AS conceptStatus,
  COALESCE(cm.mastery_score,0) AS masteryScore,
  COUNT(DISTINCT cel.evidence_id) AS evidenceCount,
  COUNT(DISTINCT r.id) AS relationCount
FROM alai_research_questions q
LEFT JOIN concepts c ON c.id=q.concept_id
LEFT JOIN curriculum_topics t ON t.id=q.topic_id
LEFT JOIN concept_mastery cm ON cm.concept_id=c.id
LEFT JOIN concept_evidence_links cel ON cel.concept_id=c.id
LEFT JOIN relations r ON r.from_concept_id=c.id OR r.to_concept_id=c.id
WHERE q.status IN ('OPEN','IN_PROGRESS')
GROUP BY q.id
LIMIT 1000
`).all() as QuestionRow[];

const insertAnswer = db.prepare(`
INSERT OR REPLACE INTO alai_research_answers (
  id, research_question_id, answer, evidence_id, confidence_score, status, created_at, updated_at
)
VALUES (?, ?, ?, NULL, ?, 'ANSWERED', ?, ?)
`);

const closeQuestion = db.prepare(`
UPDATE alai_research_questions
SET status='ANSWERED', updated_at=?
WHERE id=?
`);

const blockQuestion = db.prepare(`
UPDATE alai_research_questions
SET status='BLOCKED', updated_at=?
WHERE id=?
`);

let closed = 0;
let blocked = 0;

for (const q of questions) {
  if (!canClose(q)) {
    blockQuestion.run(now, q.id);
    blocked++;
    continue;
  }

  const confidence = Math.min(
    0.92,
    0.55 +
      Math.min(q.evidenceCount, 5) * 0.05 +
      Math.min(q.relationCount, 6) * 0.025 +
      q.masteryScore * 0.15
  );

  insertAnswer.run(
    crypto.randomUUID(),
    q.id,
    answerText(q),
    Number(confidence.toFixed(3)),
    now,
    now
  );

  closeQuestion.run(now, q.id);
  closed++;
}

console.log("ALAI research closure engine completed.");
console.log({ processed: questions.length, closed, blocked });

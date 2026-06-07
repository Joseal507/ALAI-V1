import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_question_answers (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL UNIQUE,
  answer TEXT NOT NULL,
  evidence_id TEXT,
  confidence_score REAL NOT NULL DEFAULT 0.4,
  status TEXT NOT NULL DEFAULT 'ANSWERED',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (question_id) REFERENCES alai_self_questions(id),
  FOREIGN KEY (evidence_id) REFERENCES evidence(id)
);
`);

const questions = db.prepare(`
  SELECT
    q.id,
    q.question,
    q.topic_id AS topicId,
    q.concept_id AS conceptId,
    q.priority_score AS priority
  FROM alai_self_questions q
  WHERE q.status = 'OPEN'
  ORDER BY q.priority_score DESC, q.created_at ASC
  LIMIT 15
`).all() as {
  id: string;
  question: string;
  topicId: string | null;
  conceptId: string | null;
  priority: number;
}[];

const topicConcepts = db.prepare(`
  SELECT c.id, c.name, c.description
  FROM topic_concepts tc
  JOIN concepts c ON c.id = tc.concept_id
  WHERE tc.topic_id = ?
  ORDER BY c.name ASC
  LIMIT 8
`);

const conceptById = db.prepare(`
  SELECT id, name, description
  FROM concepts
  WHERE id = ?
`);

const insertEvidence = db.prepare(`
  INSERT INTO evidence (
    id, source_type, source_name, source_url,
    content_summary, reliability_score, captured_at
  )
  VALUES (?, 'INTERNAL_REASONING', ?, NULL, ?, 0.62, ?)
`);

const insertAnswer = db.prepare(`
  INSERT OR REPLACE INTO alai_question_answers (
    id, question_id, answer, evidence_id, confidence_score,
    status, created_at, updated_at
  )
  VALUES (?, ?, ?, ?, ?, 'ANSWERED', ?, ?)
`);

const closeQuestion = db.prepare(`
  UPDATE alai_self_questions
  SET status = 'ANSWERED',
      updated_at = ?
  WHERE id = ?
`);

const linkEvidence = db.prepare(`
  INSERT OR IGNORE INTO concept_evidence_links (
    evidence_id, concept_id, confidence_score, created_at
  )
  VALUES (?, ?, 0.62, ?)
`);

let answered = 0;

for (const q of questions) {
  let concepts: { id: string; name: string; description: string }[] = [];

  if (q.topicId) {
    concepts = topicConcepts.all(q.topicId) as typeof concepts;
  }

  if (q.conceptId) {
    const c = conceptById.get(q.conceptId) as { id: string; name: string; description: string } | undefined;
    if (c) concepts = [c];
  }

  if (concepts.length === 0) continue;

  const names = concepts.map((c) => c.name).join(", ");
  const answer =
    `Question: ${q.question}\n` +
    `Answer: This can be explained using the related concepts: ${names}. ` +
    `The key learning task is to define each concept, give a simple example, connect it to prerequisites, and test it with a small exercise. ` +
    `This answer is internally generated from ALAI's current curriculum graph and must be strengthened later with external trusted sources.`;

  const evidenceId = crypto.randomUUID();

  insertEvidence.run(
    evidenceId,
    `ALAI answered self-question`,
    answer,
    now
  );

  for (const concept of concepts) {
    linkEvidence.run(evidenceId, concept.id, now);
  }

  insertAnswer.run(
    crypto.randomUUID(),
    q.id,
    answer,
    evidenceId,
    0.62,
    now,
    now
  );

  closeQuestion.run(now, q.id);
  answered++;
}

console.log("ALAI question answering engine completed.");
console.log({ questionsProcessed: questions.length, answered });

console.table(db.prepare(`
  SELECT
    q.question,
    a.confidence_score AS confidence,
    a.status
  FROM alai_question_answers a
  JOIN alai_self_questions q ON q.id = a.question_id
  ORDER BY a.created_at DESC
  LIMIT 20
`).all());

import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_self_questions (
  id TEXT PRIMARY KEY,
  topic_id TEXT,
  concept_id TEXT,
  question TEXT NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'UNDERSTANDING',
  status TEXT NOT NULL DEFAULT 'OPEN',
  priority_score REAL NOT NULL DEFAULT 0.5,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(topic_id, concept_id, question)
);
`);

const weakTopics = db.prepare(`
  SELECT t.id, t.name, tr.rollup_coverage_score
  FROM topic_coverage_rollup tr
  JOIN curriculum_topics t ON t.id = tr.topic_id
  JOIN academic_domains d ON d.id = t.domain_id
  WHERE d.name IN ('Primary Foundations', 'Foundational Learning')
    AND tr.concepts_total > 0
    AND tr.rollup_coverage_score < 0.75
  ORDER BY tr.rollup_coverage_score ASC
  LIMIT 20
`).all() as { id: string; name: string; rollup_coverage_score: number }[];

const weakConcepts = db.prepare(`
  SELECT c.id, c.name, c.confidence_score
  FROM concepts c
  WHERE c.confidence_score < 0.7
  ORDER BY c.confidence_score ASC
  LIMIT 30
`).all() as { id: string; name: string; confidence_score: number }[];

const insertQuestion = db.prepare(`
  INSERT OR IGNORE INTO alai_self_questions (
    id, topic_id, concept_id, question, question_type,
    status, priority_score, created_at, updated_at
  )
  VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?, ?)
`);

let created = 0;

for (const topic of weakTopics) {
  const questions = [
    `What are the core ideas of ${topic.name}?`,
    `What examples explain ${topic.name} clearly?`,
    `What prerequisite knowledge is needed before ${topic.name}?`,
    `How can ${topic.name} be tested with a simple exercise?`,
  ];

  for (const question of questions) {
    insertQuestion.run(
      crypto.randomUUID(),
      topic.id,
      null,
      question,
      "TOPIC_UNDERSTANDING",
      Number((1 - topic.rollup_coverage_score).toFixed(3)),
      now,
      now
    );
    created++;
  }
}

for (const concept of weakConcepts) {
  const questions = [
    `What does ${concept.name} mean?`,
    `What is a simple example of ${concept.name}?`,
    `How is ${concept.name} different from related concepts?`,
  ];

  for (const question of questions) {
    insertQuestion.run(
      crypto.randomUUID(),
      null,
      concept.id,
      question,
      "CONCEPT_CLARIFICATION",
      Number((1 - concept.confidence_score).toFixed(3)),
      now,
      now
    );
    created++;
  }
}

console.log("ALAI self-question engine completed.");
console.log({ attemptedQuestions: created });

console.table(db.prepare(`
  SELECT question, question_type AS type, priority_score AS priority, status
  FROM alai_self_questions
  WHERE status = 'OPEN'
  ORDER BY priority_score DESC, created_at ASC
  LIMIT 25
`).all());

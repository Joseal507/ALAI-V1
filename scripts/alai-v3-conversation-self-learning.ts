import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_v3_conversation_self_learning_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  feedback_scanned INTEGER NOT NULL DEFAULT 0,
  research_created INTEGER NOT NULL DEFAULT 0,
  lessons_created INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'RUNNING'
);

CREATE TABLE IF NOT EXISTS alai_conversational_learning_feedback (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  score REAL NOT NULL,
  gap_detected TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
`);

const runId = crypto.randomUUID();
db.prepare(`INSERT INTO alai_v3_conversation_self_learning_runs (id, started_at, status) VALUES (?, ?, 'RUNNING')`).run(runId, now);

const feedback = db.prepare(`
SELECT id, question, score, gap_detected
FROM alai_conversational_learning_feedback
WHERE gap_detected!=''
ORDER BY created_at DESC
LIMIT 100
`).all() as any[];

let researchCreated = 0;
let lessonsCreated = 0;

for (const f of feedback) {
  const q = `Conversation self-learning: ${f.gap_detected} Question: ${f.question}`;
  const exists = db.prepare(`SELECT id FROM alai_research_questions WHERE lower(question)=lower(?) LIMIT 1`).get(q) as any;

  if (!exists) {
    db.prepare(`
      INSERT INTO alai_research_questions
      (id, concept_id, topic_id, question, question_type, priority_score, status, created_at, updated_at)
      VALUES (?, NULL, NULL, ?, 'CONVERSATION_SELF_LEARNING', 0.88, 'OPEN', ?, ?)
    `).run(crypto.randomUUID(), q, now, now);
    researchCreated++;
  }

  db.prepare(`
    INSERT INTO alai_episodic_memories
    (id, episode_type, title, summary, outcome, lesson, importance_score, status, created_at, updated_at)
    VALUES (?, 'CONVERSATION_LEARNING', ?, ?, 'NEEDS_IMPROVEMENT', ?, 0.82, 'ACTIVE', ?, ?)
  `).run(
    crypto.randomUUID(),
    `Conversation learning gap`,
    `Question: ${f.question}; Score: ${f.score}`,
    f.gap_detected,
    now,
    now
  );
  lessonsCreated++;
}

db.prepare(`
UPDATE alai_v3_conversation_self_learning_runs
SET finished_at=?,
    feedback_scanned=?,
    research_created=?,
    lessons_created=?,
    status='COMPLETED'
WHERE id=?
`).run(new Date().toISOString(), feedback.length, researchCreated, lessonsCreated, runId);

console.log("ALAI V3 conversation self-learning completed.");
console.log({ feedbackScanned: feedback.length, researchCreated, lessonsCreated });

db.close();

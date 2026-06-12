import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_conversation_learning_events (
  id TEXT PRIMARY KEY,
  user_message TEXT NOT NULL,
  answer TEXT NOT NULL,
  score REAL NOT NULL DEFAULT 0,
  detected_gap TEXT NOT NULL,
  action_taken TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);

function tableExists(name: string): boolean {
  return !!db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(name);
}

let eventsCreated = 0;
let questionsCreated = 0;

if (tableExists("alai_response_evaluations")) {
  const rows = db.prepare(`
    SELECT user_message, answer, score, missing_knowledge, reason
    FROM alai_response_evaluations
    WHERE score < 75 OR should_research=1
    ORDER BY created_at DESC
    LIMIT 100
  `).all() as any[];

  for (const row of rows) {
    const gap = String(row.missing_knowledge || row.reason || "Unknown conversation gap").slice(0, 500);

    const inserted = db.prepare(`
      INSERT OR IGNORE INTO alai_conversation_learning_events
      (id, user_message, answer, score, detected_gap, action_taken, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'RESEARCH_QUESTION_CREATED', 'OPEN', ?, ?)
    `).run(
      crypto.randomUUID(),
      String(row.user_message || ""),
      String(row.answer || ""),
      Number(row.score || 0),
      gap,
      now,
      now
    );

    eventsCreated += inserted.changes;

    const q = `What does ALAI need to learn to answer this user request better: ${String(row.user_message || "").slice(0, 180)}?`;

    const exists = db.prepare(`
      SELECT id FROM alai_research_questions
      WHERE lower(question)=lower(?)
      LIMIT 1
    `).get(q);

    if (!exists) {
      db.prepare(`
        INSERT INTO alai_research_questions
        (id, concept_id, topic_id, question, question_type, priority_score, status, created_at, updated_at)
        VALUES (?, NULL, NULL, ?, 'CONVERSATION_LEARNING_GAP', 0.93, 'OPEN', ?, ?)
      `).run(crypto.randomUUID(), q, now, now);
      questionsCreated++;
    }
  }
}

console.log("ALAI conversation learning engine completed.");
console.log({ eventsCreated, questionsCreated });

db.close();

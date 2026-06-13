import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_research_auto_closer_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  scanned INTEGER NOT NULL DEFAULT 0,
  answered INTEGER NOT NULL DEFAULT 0,
  blocked INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'RUNNING'
);

CREATE TABLE IF NOT EXISTS alai_autonomous_research_closures (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL,
  question_type TEXT NOT NULL,
  closure_type TEXT NOT NULL,
  answer TEXT NOT NULL,
  confidence_score REAL NOT NULL DEFAULT 0.75,
  created_at TEXT NOT NULL
);
`);

const runId = crypto.randomUUID();

db.prepare(`
INSERT INTO alai_research_auto_closer_runs (id, started_at, status)
VALUES (?, ?, 'RUNNING')
`).run(runId, now);

const rows = db.prepare(`
SELECT id, question, question_type
FROM alai_research_questions
WHERE status='OPEN'
LIMIT 1000
`).all() as any[];

let answered = 0;
let blocked = 0;

for (const q of rows) {
  let answer = "";
  let closureType = "ANSWERED_BY_AUTONOMOUS_POLICY";
  let confidence = 0.82;

  if (q.question_type === "AUTONOMOUS_RELATION_DISCOVERY") {
    answer = "Relation discovery should only accept prerequisite, part-of, cause-effect, application, or contrast relations when they share domain, topic, evidence, semantic terms, or validated graph support. Unsupported cross-domain edges must be rejected by relation court.";
  } else if (q.question_type === "AUTONOMOUS_MASTERY_DISCOVERY") {
    answer = "Mastery is proven when ALAI can explain, apply, compare, test, connect prerequisites, cite supporting evidence, and pass quality checks without open flags.";
  } else if (q.question_type === "WEAK_DOMAIN_DISCOVERY") {
    answer = "Weak domains should be strengthened through curriculum objectives, missing concept discovery, evidence expansion, relation validation, mastery checks, and domain coverage rollups.";
  } else if (q.question_type === "CONVERSATION_LEARNING_GAP") {
    answer = "Conversation gaps should create targeted retrieval, relation grounding, answer synthesis, and self-evaluation improvements for future answers.";
  } else {
    closureType = "BLOCKED_BY_AUTONOMOUS_POLICY";
    answer = "This question type is not currently safe to auto-close without external evidence or a specialized resolver.";
    confidence = 0.55;
  }

  db.prepare(`
    INSERT INTO alai_autonomous_research_closures
    (id, question_id, question_type, closure_type, answer, confidence_score, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    q.id,
    q.question_type,
    closureType,
    answer,
    confidence,
    now
  );

  db.prepare(`
    UPDATE alai_research_questions
    SET status=?,
        updated_at=?
    WHERE id=?
  `).run(
    closureType === "BLOCKED_BY_AUTONOMOUS_POLICY" ? "BLOCKED" : "ANSWERED",
    now,
    q.id
  );

  if (closureType === "BLOCKED_BY_AUTONOMOUS_POLICY") blocked++;
  else answered++;
}

db.prepare(`
UPDATE alai_research_auto_closer_runs
SET finished_at=?,
    scanned=?,
    answered=?,
    blocked=?,
    status='COMPLETED'
WHERE id=?
`).run(new Date().toISOString(), rows.length, answered, blocked, runId);

console.log("ALAI research auto closer completed.");
console.log({ scanned: rows.length, answered, blocked });

db.close();

import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_v3_curriculum_executor_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  objectives_processed INTEGER NOT NULL DEFAULT 0,
  concepts_created INTEGER NOT NULL DEFAULT 0,
  questions_created INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'RUNNING'
);
`);

const runId = crypto.randomUUID();

db.prepare(`INSERT INTO alai_v3_curriculum_executor_runs (id, started_at, status) VALUES (?, ?, 'RUNNING')`).run(runId, now);

const objectives = db.prepare(`
SELECT id, domain_name, topic_name, objective, priority_score
FROM alai_v2_curriculum_full_study_queue
WHERE status='OPEN'
ORDER BY priority_score DESC, created_at ASC
LIMIT 25
`).all() as any[];

let conceptsCreated = 0;
let questionsCreated = 0;

for (const o of objectives) {
  const baseName = o.topic_name || o.domain_name;
  const conceptNames = [
    `${baseName} Definition`,
    `${baseName} Examples`,
    `${baseName} Applications`,
    `${baseName} Prerequisites`,
    `${baseName} Mastery Check`
  ];

  for (const name of conceptNames) {
    const existing = db.prepare(`SELECT id FROM concepts WHERE lower(name)=lower(?) LIMIT 1`).get(name) as any;
    if (!existing) {
      db.prepare(`
        INSERT INTO concepts (id, name, description, status, confidence_score, created_at, updated_at)
        VALUES (?, ?, ?, 'PENDING', 0.55, ?, ?)
      `).run(
        crypto.randomUUID(),
        name,
        `Autonomous curriculum concept generated for ${o.objective}`,
        now,
        now
      );
      conceptsCreated++;
    }
  }

  const qExists = db.prepare(`
    SELECT id FROM alai_research_questions
    WHERE lower(question)=lower(?)
    LIMIT 1
  `).get(`Study curriculum objective: ${o.objective}`) as any;

  if (!qExists) {
    db.prepare(`
      INSERT INTO alai_research_questions
      (id, concept_id, topic_id, question, question_type, priority_score, status, created_at, updated_at)
      VALUES (?, NULL, NULL, ?, 'CURRICULUM_OBJECTIVE_STUDY', ?, 'OPEN', ?, ?)
    `).run(
      crypto.randomUUID(),
      `Study curriculum objective: ${o.objective}`,
      Number(o.priority_score || 0.7),
      now,
      now
    );
    questionsCreated++;
  }

  db.prepare(`
    UPDATE alai_v2_curriculum_full_study_queue
    SET status='IN_PROGRESS', updated_at=?
    WHERE id=?
  `).run(now, o.id);
}

db.prepare(`
UPDATE alai_v3_curriculum_executor_runs
SET finished_at=?,
    objectives_processed=?,
    concepts_created=?,
    questions_created=?,
    status='COMPLETED'
WHERE id=?
`).run(new Date().toISOString(), objectives.length, conceptsCreated, questionsCreated, runId);

console.log("ALAI V3 curriculum executor completed.");
console.log({ objectivesProcessed: objectives.length, conceptsCreated, questionsCreated });

db.close();

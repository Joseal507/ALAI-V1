import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_reasoning_traces (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  trace_type TEXT NOT NULL,
  public_reasoning TEXT NOT NULL,
  conclusion TEXT NOT NULL,
  confidence_score REAL NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);

const tasks = db.prepare(`
SELECT id, prompt, priority_score AS priority
FROM alai_reasoning_tasks
WHERE status='OPEN'
ORDER BY priority_score DESC, created_at ASC
LIMIT 300
`).all() as any[];

let traces = 0;
let completed = 0;

for (const task of tasks) {
  const paths = db.prepare(`
    SELECT path_text, path_depth, confidence_score
    FROM alai_reasoning_paths
    WHERE task_id=?
    ORDER BY confidence_score DESC
    LIMIT 3
  `).all(task.id) as any[];

  if (paths.length === 0) continue;

  const publicReasoning = paths
    .map((p, idx) => `Step ${idx + 1}: ${p.path_text}.`)
    .join(" ");

  const conclusion =
    `A useful answer should connect the concepts through the strongest available graph path, explain each relation, and state uncertainty when the path is provisional.`;

  db.prepare(`
    INSERT INTO alai_reasoning_traces
    (id, task_id, trace_type, public_reasoning, conclusion, confidence_score, status, created_at, updated_at)
    VALUES (?, ?, 'PUBLIC_MULTI_STEP_REASONING', ?, ?, ?, 'READY', ?, ?)
  `).run(
    crypto.randomUUID(),
    task.id,
    publicReasoning,
    conclusion,
    Math.min(0.95, Number(task.priority || 0.5)),
    now,
    now
  );

  db.prepare(`
    UPDATE alai_reasoning_tasks
    SET status='COMPLETED',
        updated_at=?
    WHERE id=?
  `).run(now, task.id);

  traces++;
  completed++;
}

console.log("ALAI chain-of-thought simulator completed.");
console.log({ tasks: tasks.length, traces, completed });

db.close();

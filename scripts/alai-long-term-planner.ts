import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_long_term_plans (
  id TEXT PRIMARY KEY,
  goal TEXT NOT NULL UNIQUE,
  rationale TEXT NOT NULL,
  priority_score REAL NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alai_plan_tasks (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  task TEXT NOT NULL,
  dependency TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(plan_id, step_order, task)
);
`);

function n(sql: string): number {
  return Number((db.prepare(sql).get() as any)?.n ?? 0);
}

function plan(goal: string, rationale: string, priority: number, tasks: string[]) {
  const existing = db.prepare(`SELECT id FROM alai_long_term_plans WHERE goal=? LIMIT 1`).get(goal) as any;
  const planId = existing?.id ?? crypto.randomUUID();

  db.prepare(`
    INSERT OR IGNORE INTO alai_long_term_plans
    (id, goal, rationale, priority_score, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'OPEN', ?, ?)
  `).run(planId, goal, rationale, priority, now, now);

  for (let i = 0; i < tasks.length; i++) {
    db.prepare(`
      INSERT OR IGNORE INTO alai_plan_tasks
      (id, plan_id, step_order, task, dependency, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?)
    `).run(
      crypto.randomUUID(),
      planId,
      i + 1,
      tasks[i],
      i === 0 ? "" : tasks[i - 1],
      now,
      now
    );
  }
}

const openFlags = n(`SELECT COUNT(*) AS n FROM alai_quality_flags WHERE status='OPEN'`);
const openResearch = n(`SELECT COUNT(*) AS n FROM alai_research_questions WHERE status='OPEN'`);
const pending = n(`SELECT COUNT(*) AS n FROM concepts WHERE status='PENDING'`);

if (openFlags > 0 || openResearch > 0 || pending > 1000) {
  plan(
    "Reach stable autonomous self-feeding",
    `Current debt: ${openFlags} quality flags, ${openResearch} open research questions, ${pending} pending concepts.`,
    0.98,
    [
      "Stop uncontrolled expansion when cognitive debt is high",
      "Close or block open evidence-required research questions",
      "Resolve quality flags by evidence linking, curriculum linking, or rejection",
      "Promote only concepts with evidence, relations, and competency",
      "Resume expansion only after health returns above 90"
    ]
  );
}

plan(
  "Build GPT-competitive agentic cognition",
  "ALAI needs episodic memory, long-term planning, conversation learning, and a belief system.",
  0.96,
  [
    "Store decisions, errors, successes, and lessons as episodic memory",
    "Convert high-level goals into ordered subtasks and dependencies",
    "Learn from user conversations by detecting failed answers and research gaps",
    "Represent beliefs as claims with confidence, evidence, counterevidence, and revision history",
    "Use plans and beliefs during answer generation"
  ]
);

console.log("ALAI long-term planner completed.");
console.table(db.prepare(`
SELECT goal, priority_score, status
FROM alai_long_term_plans
ORDER BY priority_score DESC
`).all());

db.close();

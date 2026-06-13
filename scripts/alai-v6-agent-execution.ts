import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_v6_agent_execution_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  agent_goals_created INTEGER NOT NULL DEFAULT 0,
  execution_steps_created INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'RUNNING'
);

CREATE TABLE IF NOT EXISTS alai_v6_agent_goals (
  id TEXT PRIMARY KEY,
  goal_name TEXT NOT NULL UNIQUE,
  goal_type TEXT NOT NULL,
  success_condition TEXT NOT NULL,
  priority_score REAL NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alai_v6_agent_execution_steps (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  tool_name TEXT NOT NULL,
  instruction TEXT NOT NULL,
  success_check TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(goal_id, step_order)
);
`);

const runId = crypto.randomUUID();
db.prepare(`INSERT INTO alai_v6_agent_execution_runs (id, started_at, status) VALUES (?, ?, 'RUNNING')`).run(runId, now);

const goals = [
  {
    name: "Improve weak curriculum domain",
    type: "CURRICULUM_AGENT",
    success: "Domain coverage improves without open flags.",
    priority: 0.96,
    steps: [
      ["domain_intelligence", "Select weakest domain.", "Domain selected."],
      ["curriculum_executor", "Create/execute objectives.", "Objectives impacted."],
      ["research_auto_closer", "Close generated research safely.", "Open research reduced."],
      ["relation_court", "Validate relations.", "No duplicate/bad relations."],
      ["ratings", "Score improvement.", "Ratings stable or improved."]
    ]
  },
  {
    name: "Improve weak answer",
    type: "ANSWER_AGENT",
    success: "Answer quality improves above threshold.",
    priority: 0.94,
    steps: [
      ["v3_answer", "Generate answer.", "Quality score created."],
      ["self_improvement", "Detect weakness.", "Objective created."],
      ["research_executor", "Fill missing context.", "Knowledge added."],
      ["v3_answer", "Regenerate answer.", "Quality improved."]
    ]
  },
  {
    name: "Maintain autonomous stability",
    type: "STABILITY_AGENT",
    success: "Open flags and open research remain zero.",
    priority: 0.98,
    steps: [
      ["cognitive_debt_governor", "Check debt.", "Debt measured."],
      ["research_auto_closer", "Close safe research.", "Open research low."],
      ["pending_promotion", "Reject/promote concepts.", "Pending controlled."],
      ["health", "Audit world model.", "Health stable."]
    ]
  }
];

let goalsCreated = 0;
let stepsCreated = 0;

for (const g of goals) {
  const goalId = crypto.randomUUID();
  const r = db.prepare(`
    INSERT OR IGNORE INTO alai_v6_agent_goals
    (id, goal_name, goal_type, success_condition, priority_score, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?)
  `).run(goalId, g.name, g.type, g.success, g.priority, now, now);

  goalsCreated += r.changes;

  const existing = db.prepare(`SELECT id FROM alai_v6_agent_goals WHERE goal_name=?`).get(g.name) as any;
  const finalGoalId = r.changes ? goalId : existing.id;

  g.steps.forEach((s, i) => {
    const x = db.prepare(`
      INSERT OR IGNORE INTO alai_v6_agent_execution_steps
      (id, goal_id, step_order, tool_name, instruction, success_check, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)
    `).run(crypto.randomUUID(), finalGoalId, i + 1, s[0], s[1], s[2], now, now);
    stepsCreated += x.changes;
  });
}

db.prepare(`
UPDATE alai_v6_agent_execution_runs
SET finished_at=?, agent_goals_created=?, execution_steps_created=?, status='COMPLETED'
WHERE id=?
`).run(new Date().toISOString(), goalsCreated, stepsCreated, runId);

console.log("ALAI V6 agent execution completed.");
console.log({ goalsCreated, stepsCreated });

db.close();

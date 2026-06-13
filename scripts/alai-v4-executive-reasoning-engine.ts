import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_v4_executive_reasoning_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  plans_created INTEGER NOT NULL DEFAULT 0,
  steps_created INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'RUNNING'
);

CREATE TABLE IF NOT EXISTS alai_v4_executive_reasoning_plans (
  id TEXT PRIMARY KEY,
  goal TEXT NOT NULL UNIQUE,
  reasoning_type TEXT NOT NULL,
  priority_score REAL NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alai_v4_executive_reasoning_steps (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  step_name TEXT NOT NULL,
  expected_output TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(plan_id, step_order)
);
`);

const runId = crypto.randomUUID();
db.prepare(`INSERT INTO alai_v4_executive_reasoning_runs (id, started_at, status) VALUES (?, ?, 'RUNNING')`).run(runId, now);

const plans = [
  {
    goal: "Answer complex user questions using multi-step reasoning",
    type: "QUESTION_REASONING",
    priority: 0.98,
    steps: [
      ["Intent analysis", "Classify the user goal and expected answer type."],
      ["Concept targeting", "Identify the strongest concepts and reject irrelevant ones."],
      ["Evidence grounding", "Collect evidence, beliefs, and relations that support the answer."],
      ["Subproblem decomposition", "Break the answer into necessary smaller claims."],
      ["Reasoning synthesis", "Connect subclaims into a coherent conclusion."],
      ["Uncertainty check", "State limits and create research gaps if confidence is weak."],
      ["Answer generation", "Produce clear answer for the user."]
    ]
  },
  {
    goal: "Execute curriculum learning objective end-to-end",
    type: "CURRICULUM_REASONING",
    priority: 0.97,
    steps: [
      ["Select objective", "Choose highest priority curriculum objective."],
      ["Map prerequisites", "Find required prior concepts."],
      ["Generate concepts", "Create missing concept candidates."],
      ["Attach evidence", "Link evidence and examples."],
      ["Validate relations", "Run relation and path courts."],
      ["Create mastery tests", "Generate explain/apply/compare/test tasks."],
      ["Promote safely", "Promote only if quality gates pass."]
    ]
  },
  {
    goal: "Self-improve weak answer domains",
    type: "SELF_IMPROVEMENT_REASONING",
    priority: 0.96,
    steps: [
      ["Detect weak answer", "Find low quality answer or repeated gap."],
      ["Identify missing context", "Find missing concept, relation, evidence, or belief."],
      ["Create repair objective", "Create targeted research or mastery task."],
      ["Run repair", "Execute research, relation, belief, or synthesis update."],
      ["Re-answer", "Generate improved answer."],
      ["Compare scores", "Keep improvement only if score rises."]
    ]
  }
];

let plansCreated = 0;
let stepsCreated = 0;

for (const p of plans) {
  const id = crypto.randomUUID();

  const result = db.prepare(`
    INSERT OR IGNORE INTO alai_v4_executive_reasoning_plans
    (id, goal, reasoning_type, priority_score, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'OPEN', ?, ?)
  `).run(id, p.goal, p.type, p.priority, now, now);

  plansCreated += result.changes;

  const plan = db.prepare(`SELECT id FROM alai_v4_executive_reasoning_plans WHERE goal=?`).get(p.goal) as any;

  p.steps.forEach(([name, output], idx) => {
    const r = db.prepare(`
      INSERT OR IGNORE INTO alai_v4_executive_reasoning_steps
      (id, plan_id, step_order, step_name, expected_output, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?)
    `).run(crypto.randomUUID(), plan.id, idx + 1, name, output, now, now);
    stepsCreated += r.changes;
  });
}

db.prepare(`
UPDATE alai_v4_executive_reasoning_runs
SET finished_at=?, plans_created=?, steps_created=?, status='COMPLETED'
WHERE id=?
`).run(new Date().toISOString(), plansCreated, stepsCreated, runId);

console.log("ALAI V4 executive reasoning engine completed.");
console.log({ plansCreated, stepsCreated });

db.close();

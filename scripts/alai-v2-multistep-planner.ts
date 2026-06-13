import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_v2_multistep_plans (
  id TEXT PRIMARY KEY,
  goal TEXT NOT NULL UNIQUE,
  plan_type TEXT NOT NULL,
  priority_score REAL NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alai_v2_multistep_plan_steps (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  step_name TEXT NOT NULL,
  step_prompt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(plan_id, step_order)
);
`);

const plans = [
  {
    goal: "Study the complete curriculum autonomously",
    type: "CURRICULUM_FULL_STUDY",
    priority: 0.98,
    steps: [
      "Select weakest domain by coverage.",
      "Select highest priority open curriculum objective.",
      "Discover missing concepts and prerequisites.",
      "Attach evidence and examples.",
      "Validate relations through courts.",
      "Generate mastery tasks.",
      "Promote safe concepts.",
      "Run health and autonomy audit."
    ]
  },
  {
    goal: "Answer user questions with real reasoning",
    type: "CONVERSATIONAL_REASONING",
    priority: 0.96,
    steps: [
      "Detect intent and target concepts.",
      "Retrieve semantically relevant concepts.",
      "Retrieve beliefs, evidence, relations, memories.",
      "Plan sub-answer structure.",
      "Generate answer synthesis.",
      "Self-evaluate grounding and usefulness.",
      "Create research gap if confidence is weak."
    ]
  },
  {
    goal: "Keep ALAI stable while self-feeding",
    type: "AUTONOMOUS_STABILITY",
    priority: 0.99,
    steps: [
      "Check open flags, open research, pending concepts.",
      "If debt is high, enter consolidation mode.",
      "If debt is low, enter curriculum learning mode.",
      "Run relation, trace, and path courts.",
      "Run belief revision.",
      "Record episodic lesson.",
      "Stop expansion if health degrades."
    ]
  }
];

for (const p of plans) {
  const planId = crypto.randomUUID();

  const result = db.prepare(`
    INSERT OR IGNORE INTO alai_v2_multistep_plans
    (id, goal, plan_type, priority_score, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'OPEN', ?, ?)
  `).run(planId, p.goal, p.type, p.priority, now, now);

  const existing = db.prepare(`SELECT id FROM alai_v2_multistep_plans WHERE goal=?`).get(p.goal) as any;
  const finalPlanId = result.changes > 0 ? planId : existing.id;

  p.steps.forEach((step, idx) => {
    db.prepare(`
      INSERT OR IGNORE INTO alai_v2_multistep_plan_steps
      (id, plan_id, step_order, step_name, step_prompt, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?)
    `).run(
      crypto.randomUUID(),
      finalPlanId,
      idx + 1,
      step,
      step,
      now,
      now
    );
  });
}

console.log("ALAI V2 multi-step planner completed.");
console.table(db.prepare(`
SELECT p.goal, COUNT(s.id) AS steps
FROM alai_v2_multistep_plans p
LEFT JOIN alai_v2_multistep_plan_steps s ON s.plan_id=p.id
GROUP BY p.id
ORDER BY p.priority_score DESC
`).all());

db.close();

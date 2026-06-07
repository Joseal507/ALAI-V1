import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS education_ladder (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  stage_order INTEGER NOT NULL UNIQUE,
  min_age INTEGER,
  max_age INTEGER,
  description TEXT NOT NULL DEFAULT '',
  autonomy_goal TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alai_growth_stage (
  id TEXT PRIMARY KEY,
  stage_name TEXT NOT NULL UNIQUE,
  stage_order INTEGER NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  unlock_condition TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);

const stages = [
  {
    name: "Baby / Foundational Development",
    stage_order: 1,
    min_age: 0,
    max_age: 3,
    description: "Pre-language foundations, perception, basic interaction, sensory categories, social signals.",
    autonomy_goal: "Build primitive concepts and basic world categories."
  },
  {
    name: "Early Childhood / Preschool / Kindergarten",
    stage_order: 2,
    min_age: 3,
    max_age: 6,
    description: "Motor skills, social development, early language, counting, shapes, colors, stories.",
    autonomy_goal: "Learn basic symbolic categories and simple explanations."
  },
  {
    name: "Primary School / Elementary",
    stage_order: 3,
    min_age: 6,
    max_age: 12,
    description: "Reading, writing, arithmetic, basic science, basic social studies.",
    autonomy_goal: "Master foundational literacy, numeracy, and basic factual knowledge."
  },
  {
    name: "Lower Secondary / Middle School",
    stage_order: 4,
    min_age: 12,
    max_age: 15,
    description: "Pre-algebra, algebra foundations, biology, physics basics, geography, history, structured writing.",
    autonomy_goal: "Build structured academic reasoning and prerequisite chains."
  },
  {
    name: "Upper Secondary / High School / Bachillerato",
    stage_order: 5,
    min_age: 15,
    max_age: 18,
    description: "Algebra, geometry, calculus readiness, chemistry, physics, literature, civics, academic writing.",
    autonomy_goal: "Prepare for university-level specialization."
  },
  {
    name: "Undergraduate / Associate / Bachelor",
    stage_order: 6,
    min_age: 18,
    max_age: 24,
    description: "Professional and disciplinary foundations: engineering, medicine, law, business, sciences, humanities.",
    autonomy_goal: "Develop domain-level expertise."
  },
  {
    name: "Postgraduate / Specialization / Master",
    stage_order: 7,
    min_age: 22,
    max_age: 30,
    description: "Advanced specialization, research methods, expert-level frameworks.",
    autonomy_goal: "Deepen expertise and compare sources critically."
  },
  {
    name: "Doctorate / PhD",
    stage_order: 8,
    min_age: 25,
    max_age: 40,
    description: "Original research, theory building, advanced methodology, contribution to knowledge.",
    autonomy_goal: "Generate, test, and refine new knowledge."
  },
  {
    name: "Postdoctoral / Research Continuation",
    stage_order: 9,
    min_age: 28,
    max_age: null,
    description: "Independent research, publication, frontier knowledge, advanced academic contribution.",
    autonomy_goal: "Operate near the frontier of human knowledge."
  },
  {
    name: "Beyond Academia / General Intelligence Expansion",
    stage_order: 10,
    min_age: null,
    max_age: null,
    description: "Practical intelligence, tool use, business, creativity, software, strategy, agentic workflows, real-world systems.",
    autonomy_goal: "Expand beyond formal academia into powerful general AI capability."
  }
];

const upsertStage = db.prepare(`
  INSERT INTO education_ladder (
    id, name, stage_order, min_age, max_age, description, autonomy_goal, created_at, updated_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(name) DO UPDATE SET
    stage_order = excluded.stage_order,
    min_age = excluded.min_age,
    max_age = excluded.max_age,
    description = excluded.description,
    autonomy_goal = excluded.autonomy_goal,
    updated_at = excluded.updated_at
`);

for (const stage of stages) {
  upsertStage.run(
    crypto.randomUUID(),
    stage.name,
    stage.stage_order,
    stage.min_age,
    stage.max_age,
    stage.description,
    stage.autonomy_goal,
    now,
    now
  );
}

const growthStages = [
  {
    stage_name: "Academic Baby",
    stage_order: 1,
    description: "ALAI starts with primitive concepts, language basics, numbers, categories, and simple cause/effect.",
    unlock_condition: "Always starts here."
  },
  {
    stage_name: "Foundational Student",
    stage_order: 2,
    description: "ALAI masters elementary reading, writing, arithmetic, basic science, and basic reasoning.",
    unlock_condition: "Primary completion and effective coverage pass minimum threshold."
  },
  {
    stage_name: "Academic Student",
    stage_order: 3,
    description: "ALAI learns middle and high school curriculum with prerequisites and coverage tracking.",
    unlock_condition: "Foundational subjects are sufficiently mapped and covered."
  },
  {
    stage_name: "University Student",
    stage_order: 4,
    description: "ALAI enters undergraduate domains and begins professional specialization.",
    unlock_condition: "High school readiness is sufficient."
  },
  {
    stage_name: "Researcher",
    stage_order: 5,
    description: "ALAI learns postgraduate and PhD-level knowledge, research methods, and source criticism.",
    unlock_condition: "Undergraduate domain coverage reaches expert threshold."
  },
  {
    stage_name: "Autonomous Research Agent",
    stage_order: 6,
    description: "ALAI can identify gaps, search sources, evaluate reliability, learn, update mastery, and plan next expansions.",
    unlock_condition: "Research quality, coverage, contradiction checks, and audit safety pass thresholds."
  },
  {
    stage_name: "General AI Expansion",
    stage_order: 7,
    description: "ALAI expands beyond school into software, strategy, tools, creativity, business, agents, and real-world execution.",
    unlock_condition: "Academic spine is strong enough to support safe open-ended expansion."
  }
];

const upsertGrowth = db.prepare(`
  INSERT INTO alai_growth_stage (
    id, stage_name, stage_order, description, unlock_condition, created_at, updated_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(stage_name) DO UPDATE SET
    stage_order = excluded.stage_order,
    description = excluded.description,
    unlock_condition = excluded.unlock_condition,
    updated_at = excluded.updated_at
`);

for (const stage of growthStages) {
  upsertGrowth.run(
    crypto.randomUUID(),
    stage.stage_name,
    stage.stage_order,
    stage.description,
    stage.unlock_condition,
    now,
    now
  );
}

console.log("Education ladder seeded.");
console.table(stages.map((s) => ({
  order: s.stage_order,
  stage: s.name,
  ages: `${s.min_age ?? "?"}-${s.max_age ?? "open"}`,
  goal: s.autonomy_goal,
})));

console.log("ALAI growth stages seeded.");
console.table(growthStages.map((s) => ({
  order: s.stage_order,
  stage: s.stage_name,
  unlock: s.unlock_condition,
})));

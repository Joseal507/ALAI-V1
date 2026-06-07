import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_current_state (
  id TEXT PRIMARY KEY,
  current_growth_stage_id TEXT NOT NULL,
  current_education_ladder_id TEXT,
  progress_score REAL NOT NULL DEFAULT 0,
  is_locked INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (current_growth_stage_id) REFERENCES alai_growth_stage(id),
  FOREIGN KEY (current_education_ladder_id) REFERENCES education_ladder(id)
);

CREATE TABLE IF NOT EXISTS alai_stage_requirements (
  id TEXT PRIMARY KEY,
  growth_stage_id TEXT NOT NULL,
  requirement_key TEXT NOT NULL,
  requirement_description TEXT NOT NULL,
  required_score REAL NOT NULL DEFAULT 0,
  current_score REAL NOT NULL DEFAULT 0,
  passed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(growth_stage_id, requirement_key),
  FOREIGN KEY (growth_stage_id) REFERENCES alai_growth_stage(id)
);
`);

const academicBaby = db.prepare(`
  SELECT id FROM alai_growth_stage
  WHERE stage_name = 'Academic Baby'
  LIMIT 1
`).get() as { id: string } | undefined;

const babyEducation = db.prepare(`
  SELECT id FROM education_ladder
  WHERE name = 'Baby / Foundational Development'
  LIMIT 1
`).get() as { id: string } | undefined;

if (!academicBaby) throw new Error("Academic Baby stage not found.");
if (!babyEducation) throw new Error("Baby education ladder stage not found.");

const existingState = db.prepare(`
  SELECT id FROM alai_current_state
  LIMIT 1
`).get() as { id: string } | undefined;

if (!existingState) {
  db.prepare(`
    INSERT INTO alai_current_state (
      id, current_growth_stage_id, current_education_ladder_id,
      progress_score, is_locked, notes, created_at, updated_at
    )
    VALUES (?, ?, ?, 0, 0, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    academicBaby.id,
    babyEducation.id,
    "ALAI starts from Academic Baby with the full architecture available but no stage progress yet.",
    now,
    now
  );
}

const stages = db.prepare(`
  SELECT id, stage_name
  FROM alai_growth_stage
`).all() as { id: string; stage_name: string }[];

const requirementsByStage: Record<string, {
  key: string;
  description: string;
  requiredScore: number;
}[]> = {
  "Academic Baby": [
    {
      key: "basic_categories_mapped",
      description: "Primitive concepts, objects, colors, shapes, numbers, emotions, and simple cause/effect are mapped.",
      requiredScore: 0.7,
    },
    {
      key: "early_language_foundation",
      description: "Basic language concepts and simple explanations are available.",
      requiredScore: 0.7,
    },
    {
      key: "audit_safety",
      description: "No HIGH taxonomy or knowledge safety issues exist.",
      requiredScore: 1,
    },
  ],
  "Foundational Student": [
    {
      key: "primary_math_literacy",
      description: "Reading, writing, arithmetic, and basic science foundations are mapped and measured.",
      requiredScore: 0.75,
    },
    {
      key: "primary_curriculum_completion",
      description: "Primary curriculum has sufficient completion and effective coverage.",
      requiredScore: 0.7,
    },
  ],
  "Academic Student": [
    {
      key: "secondary_curriculum_completion",
      description: "Middle and high school curriculum is mapped with prerequisite chains.",
      requiredScore: 0.75,
    },
  ],
  "University Student": [
    {
      key: "undergraduate_domain_readiness",
      description: "High school readiness allows safe undergraduate specialization.",
      requiredScore: 0.8,
    },
  ],
  "Researcher": [
    {
      key: "research_method_mastery",
      description: "Research methods, source comparison, and advanced domain reasoning are strong.",
      requiredScore: 0.85,
    },
  ],
  "Autonomous Research Agent": [
    {
      key: "autonomous_learning_safety",
      description: "ALAI can identify gaps, search, validate, learn, update, and audit safely.",
      requiredScore: 0.9,
    },
  ],
  "General AI Expansion": [
    {
      key: "academic_spine_strength",
      description: "Academic spine is strong enough for open-ended non-academic expansion.",
      requiredScore: 0.9,
    },
  ],
};

const upsertRequirement = db.prepare(`
  INSERT INTO alai_stage_requirements (
    id, growth_stage_id, requirement_key, requirement_description,
    required_score, current_score, passed, created_at, updated_at
  )
  VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)
  ON CONFLICT(growth_stage_id, requirement_key) DO UPDATE SET
    requirement_description = excluded.requirement_description,
    required_score = excluded.required_score,
    updated_at = excluded.updated_at
`);

for (const stage of stages) {
  const reqs = requirementsByStage[stage.stage_name] ?? [];

  for (const req of reqs) {
    upsertRequirement.run(
      crypto.randomUUID(),
      stage.id,
      req.key,
      req.description,
      req.requiredScore,
      now,
      now
    );
  }
}

console.log("ALAI current state and stage requirements seeded.");

const state = db.prepare(`
  SELECT
    gs.stage_name AS growthStage,
    el.name AS educationStage,
    s.progress_score AS progressScore,
    s.is_locked AS isLocked,
    s.notes AS notes
  FROM alai_current_state s
  JOIN alai_growth_stage gs ON gs.id = s.current_growth_stage_id
  LEFT JOIN education_ladder el ON el.id = s.current_education_ladder_id
  LIMIT 1
`).get();

console.log(state);

const reqs = db.prepare(`
  SELECT
    gs.stage_name AS stage,
    r.requirement_key AS requirement,
    r.required_score AS requiredScore,
    r.current_score AS currentScore,
    r.passed AS passed
  FROM alai_stage_requirements r
  JOIN alai_growth_stage gs ON gs.id = r.growth_stage_id
  ORDER BY gs.stage_order, r.requirement_key
`).all();

console.table(reqs);

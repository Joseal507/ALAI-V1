import Database from "better-sqlite3";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

const current = db.prepare(`
  SELECT
    s.id AS stateId,
    gs.id AS stageId,
    gs.stage_name AS stageName,
    gs.stage_order AS stageOrder
  FROM alai_current_state s
  JOIN alai_growth_stage gs ON gs.id = s.current_growth_stage_id
  LIMIT 1
`).get() as {
  stateId: string;
  stageId: string;
  stageName: string;
  stageOrder: number;
} | undefined;

if (!current) throw new Error("ALAI current state not found.");

const requirements = db.prepare(`
  SELECT passed
  FROM alai_stage_requirements
  WHERE growth_stage_id = ?
`).all(current.stageId) as { passed: number }[];

const canPromote =
  requirements.length > 0 && requirements.every((r) => r.passed === 1);

if (!canPromote) {
  console.log("ALAI stage promotion skipped.");
  console.log({
    currentStage: current.stageName,
    reason: "Not all current stage requirements are passed.",
  });
  process.exit(0);
}

const nextStage = db.prepare(`
  SELECT id, stage_name, stage_order
  FROM alai_growth_stage
  WHERE stage_order > ?
  ORDER BY stage_order ASC
  LIMIT 1
`).get(current.stageOrder) as {
  id: string;
  stage_name: string;
  stage_order: number;
} | undefined;

if (!nextStage) {
  console.log("ALAI is already at the final growth stage.");
  process.exit(0);
}

const educationMap: Record<string, string> = {
  "Foundational Student": "Primary School / Elementary",
  "Academic Student": "Lower Secondary / Middle School",
  "University Student": "Undergraduate / Associate / Bachelor",
  "Researcher": "Postgraduate / Specialization / Master",
  "Autonomous Research Agent": "Doctorate / PhD",
  "General AI Expansion": "Beyond Academia / General Intelligence Expansion",
};

const nextEducationName = educationMap[nextStage.stage_name];

const nextEducation = nextEducationName
  ? db.prepare(`SELECT id FROM education_ladder WHERE name = ? LIMIT 1`).get(nextEducationName) as { id: string } | undefined
  : undefined;

db.prepare(`
  UPDATE alai_current_state
  SET current_growth_stage_id = ?,
      current_education_ladder_id = COALESCE(?, current_education_ladder_id),
      progress_score = 0,
      notes = ?,
      updated_at = ?
  WHERE id = ?
`).run(
  nextStage.id,
  nextEducation?.id ?? null,
  `Promoted automatically from ${current.stageName} to ${nextStage.stage_name}.`,
  now,
  current.stateId
);

console.log("ALAI promoted automatically.");
console.log({
  from: current.stageName,
  to: nextStage.stage_name,
  educationStage: nextEducationName ?? "unchanged",
});

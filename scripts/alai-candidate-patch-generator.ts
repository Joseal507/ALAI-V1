import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_candidate_patches (
  id TEXT PRIMARY KEY,
  experiment_id TEXT NOT NULL,
  title TEXT NOT NULL,
  rationale TEXT NOT NULL,
  target_files TEXT NOT NULL,
  patch_plan TEXT NOT NULL,
  validation_commands TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);

type Experiment = {
  id: string;
  title: string;
  hypothesis: string;
  targetFiles: string;
  validationCommands: string;
  riskLevel: string;
};

const experiment = db.prepare(`
  SELECT
    id,
    title,
    hypothesis,
    target_files AS targetFiles,
    validation_commands AS validationCommands,
    risk_level AS riskLevel
  FROM alai_architecture_experiments
  WHERE status IN ('PROPOSED', 'PASSED')
  ORDER BY
    CASE status WHEN 'PROPOSED' THEN 0 ELSE 1 END,
    CASE risk_level WHEN 'LOW' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END,
    updated_at DESC
  LIMIT 1
`).get() as Experiment | undefined;

if (!experiment) {
  console.log("No architecture experiment available for candidate patch generation.");
  process.exit(0);
}

const existing = db.prepare(`
  SELECT id
  FROM alai_candidate_patches
  WHERE experiment_id = ?
    AND status IN ('DRAFT','APPROVED')
  LIMIT 1
`).get(experiment.id);

if (existing) {
  console.log("Candidate patch already exists for experiment:", experiment.title);
  process.exit(0);
}

function patchPlanForExperiment(experiment: Experiment): string {
  const title = experiment.title.toLowerCase();

  if (title.includes("canonical-pack")) {
    return [
      "1. Add a dedicated script that finds evidence-backed concepts without canonical packs.",
      "2. For each concept with at least 2 evidence links or status VERIFIED/CANONICAL, call generateCanonicalPack(db, concept.id).",
      "3. Add a package.json script named alai:auto-canonical-packs.",
      "4. Run typecheck and the auto-canonical-pack script.",
      "5. Measure pack coverage before and after.",
    ].join("\\n");
  }

  if (title.includes("promotion")) {
    return [
      "1. Add a validation accelerator that targets PENDING concepts with evidence, relations, competency, and missing exams.",
      "2. Ensure autonomous exams cover all competency concepts, prioritizing concepts without exams.",
      "3. Run competency, strict mastery, and promotion after coverage improves.",
      "4. Measure pending ratio, canonical count, and verified count before and after.",
      "5. Do not lower strict mastery thresholds globally unless the experiment proves no noise increase.",
    ].join("\\n");
  }

  if (title.includes("answer planner") || title.includes("relation templates")) {
    return [
      "1. Replace topic-specific branches in answer-planner.ts with relation-type templates.",
      "2. Create generic templates for DEPENDS_ON, USED_FOR, IS_A, PART_OF, RELATED_TO, CHANGES, EXPLAINS, and reverse relations.",
      "3. Keep special-case behavior only if covered by a generic relation pattern.",
      "4. Run typecheck and graph-answer tests.",
      "5. Compare answer quality and avoid lowering confidence gates.",
    ].join("\\n");
  }

  return [
    "1. Read the target files.",
    "2. Create the smallest safe change that tests the hypothesis.",
    "3. Run validation commands.",
    "4. Compare metrics before and after.",
    "5. Reject the patch if it fails tests or reduces architecture score.",
  ].join("\\n");
}

const patchPlan = patchPlanForExperiment(experiment);

db.prepare(`
  INSERT INTO alai_candidate_patches (
    id,
    experiment_id,
    title,
    rationale,
    target_files,
    patch_plan,
    validation_commands,
    risk_level,
    status,
    created_at,
    updated_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?)
`).run(
  crypto.randomUUID(),
  experiment.id,
  `Candidate patch for: ${experiment.title}`,
  experiment.hypothesis,
  experiment.targetFiles,
  patchPlan,
  experiment.validationCommands,
  experiment.riskLevel,
  now,
  now
);

console.log("ALAI candidate patch generated.");
console.log({
  experiment: experiment.title,
  riskLevel: experiment.riskLevel,
});
console.log("");
console.log(patchPlan);

console.table(db.prepare(`
  SELECT title, risk_level, status, created_at
  FROM alai_candidate_patches
  ORDER BY created_at DESC
  LIMIT 10
`).all());

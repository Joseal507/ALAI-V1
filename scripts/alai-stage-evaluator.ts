import Database from "better-sqlite3";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

const current = db.prepare(`
  SELECT
    s.id AS state_id,
    gs.id AS growth_stage_id,
    gs.stage_name AS stage_name
  FROM alai_current_state s
  JOIN alai_growth_stage gs ON gs.id = s.current_growth_stage_id
  LIMIT 1
`).get() as {
  state_id: string;
  growth_stage_id: string;
  stage_name: string;
} | undefined;

if (!current) {
  throw new Error("ALAI current state not found. Run npm run alai:seed-state first.");
}

const currentGrowthStageId = current.growth_stage_id;

function updateRequirement(key: string, score: number) {
  const req = db.prepare(`
    SELECT id, required_score
    FROM alai_stage_requirements
    WHERE growth_stage_id = ?
      AND requirement_key = ?
    LIMIT 1
  `).get(currentGrowthStageId, key) as {
    id: string;
    required_score: number;
  } | undefined;

  if (!req) return;

  const normalized = Math.max(0, Math.min(1, score));

  db.prepare(`
    UPDATE alai_stage_requirements
    SET current_score = ?,
        passed = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    Number(normalized.toFixed(3)),
    normalized >= req.required_score ? 1 : 0,
    now,
    req.id
  );
}

const highAuditIssues = db.prepare(`
  SELECT COUNT(*) AS count
  FROM curriculum_taxonomy_audit
  WHERE resolved_at IS NULL
    AND severity = 'HIGH'
`).get() as { count: number };

const conceptCount = db.prepare(`
  SELECT COUNT(*) AS count
  FROM concepts
`).get() as { count: number };

const basicConceptSignals = db.prepare(`
  SELECT COUNT(*) AS count
  FROM concepts
  WHERE lower(name) IN (
    'number', 'numbers', 'color', 'colors', 'shape', 'shapes',
    'object', 'objects', 'animal', 'animals', 'family',
    'food', 'emotion', 'emotions', 'body', 'action'
  )
`).get() as { count: number };

const languageSignals = db.prepare(`
  SELECT COUNT(*) AS count
  FROM concepts
  WHERE lower(name) LIKE '%language%'
     OR lower(name) LIKE '%word%'
     OR lower(name) LIKE '%sentence%'
     OR lower(name) LIKE '%meaning%'
     OR lower(name) LIKE '%reading%'
     OR lower(name) LIKE '%writing%'
     OR lower(name) LIKE '%letter%'
`).get() as { count: number };

if (current.stage_name === "Academic Baby") {
  updateRequirement("audit_safety", highAuditIssues.count === 0 ? 1 : 0);
  updateRequirement("basic_categories_mapped", Math.min(1, basicConceptSignals.count / 10));
  updateRequirement("early_language_foundation", Math.min(1, languageSignals.count / 5));
}

if (current.stage_name === "Foundational Student") {
  const primary = db.prepare(`
    SELECT completion_score, known_coverage_score, effective_coverage_score
    FROM curriculum_completion c
    JOIN academic_domains d ON d.id = c.domain_id
    WHERE d.name = 'Primary Foundations'
    LIMIT 1
  `).get() as {
    completion_score: number;
    known_coverage_score: number;
    effective_coverage_score: number;
  } | undefined;

  const primaryRollup = db.prepare(`
    SELECT rollup_coverage_score
    FROM topic_coverage_rollup tr
    JOIN curriculum_topics t ON t.id = tr.topic_id
    WHERE t.name = 'Primary Foundations'
    LIMIT 1
  `).get() as { rollup_coverage_score: number } | undefined;

  const mathRows = db.prepare(`
    SELECT t.name, tr.rollup_coverage_score
    FROM topic_coverage_rollup tr
    JOIN curriculum_topics t ON t.id = tr.topic_id
    JOIN academic_domains d ON d.id = t.domain_id
    WHERE d.name = 'Primary Foundations'
      AND t.name IN (
        'Basic Arithmetic',
        'Addition',
        'Subtraction',
        'Multiplication',
        'Division',
        'Measurement',
        'Money',
        'Time'
      )
  `).all() as { name: string; rollup_coverage_score: number }[];

  const mathScore =
    mathRows.length === 0
      ? 0
      : mathRows.reduce((sum, row) => sum + row.rollup_coverage_score, 0) / mathRows.length;

  const completionScore = primary
    ? Math.max(
        primary.effective_coverage_score,
        primary.known_coverage_score * 0.7,
        primaryRollup?.rollup_coverage_score ?? 0
      )
    : 0;

  updateRequirement("primary_curriculum_completion", completionScore);
  updateRequirement("primary_math_literacy", mathScore);
}

const reqs = db.prepare(`
  SELECT current_score, required_score, passed
  FROM alai_stage_requirements
  WHERE growth_stage_id = ?
`).all(currentGrowthStageId) as {
  current_score: number;
  required_score: number;
  passed: number;
}[];

const progress =
  reqs.length === 0
    ? 0
    : reqs.reduce((sum, req) => sum + Math.min(1, req.current_score / req.required_score), 0) / reqs.length;

db.prepare(`
  UPDATE alai_current_state
  SET progress_score = ?,
      updated_at = ?
  WHERE id = ?
`).run(Number(progress.toFixed(3)), now, current.state_id);

console.log("ALAI stage evaluator completed.");
console.log({
  stage: current.stage_name,
  highAuditIssues: highAuditIssues.count,
  totalConcepts: conceptCount.count,
  progressScore: Number(progress.toFixed(3)),
});

console.table(db.prepare(`
  SELECT
    r.requirement_key AS requirement,
    r.required_score AS requiredScore,
    r.current_score AS currentScore,
    r.passed AS passed
  FROM alai_stage_requirements r
  WHERE r.growth_stage_id = ?
  ORDER BY r.requirement_key
`).all(currentGrowthStageId));

import Database from "better-sqlite3";
import { getActiveLearningDomain } from "../src/learning/education-progression";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

const current = db.prepare(`
  SELECT gs.stage_name AS stage
  FROM alai_current_state s
  JOIN alai_growth_stage gs ON gs.id = s.current_growth_stage_id
  LIMIT 1
`).get() as { stage: string } | undefined;

if (!current) throw new Error("ALAI current state not found.");

const activeDomain = getActiveLearningDomain(db);
const stageDomain = activeDomain.domainName;

db.prepare(`
  UPDATE alai_learning_objectives
  SET priority_score = 0.05,
      updated_at = ?
  WHERE status IN ('OPEN', 'IN_PROGRESS')
`).run(now);

db.prepare(`
  UPDATE alai_learning_objectives
  SET priority_score =
    CASE
      WHEN title LIKE '%Reading%' THEN 0.99
      WHEN title LIKE '%Writing%' THEN 0.98
      WHEN title LIKE '%Basic Arithmetic%' THEN 0.97
      WHEN title LIKE '%Addition%' THEN 0.96
      WHEN title LIKE '%Subtraction%' THEN 0.95
      WHEN title LIKE '%Multiplication%' THEN 0.94
      WHEN title LIKE '%Division%' THEN 0.93
      ELSE 0.75
    END,
    updated_at = ?
  WHERE topic_id IN (
    SELECT t.id
    FROM curriculum_topics t
    JOIN academic_domains d ON d.id = t.domain_id
    WHERE d.name = ?
  )
  AND status IN ('OPEN', 'IN_PROGRESS')
`).run(now, stageDomain);

console.log("ALAI objective prioritizer completed.");
console.log({
  stage: current.stage,
  activeDomain: stageDomain,
  reason: activeDomain.reason,
  knownCoverage: activeDomain.knownCoverage,
  effectiveCoverage: activeDomain.effectiveCoverage,
  passScore: activeDomain.passScore,
});

console.table(db.prepare(`
  SELECT title, status, priority_score AS priority, attempts
  FROM alai_learning_objectives
  WHERE status IN ('OPEN', 'IN_PROGRESS')
  ORDER BY priority_score DESC, updated_at DESC
  LIMIT 20
`).all());

import Database from "better-sqlite3";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

type Objective = {
  id: string;
  title: string;
  objectiveType: string;
  status: string;
  priority: number;
  topicId: string;
  topicName: string | null;
  domainName: string | null;
  effective: number | null;
  completion: number | null;
};

const objectives = db.prepare(`
  SELECT
    o.id,
    o.title,
    o.objective_type AS objectiveType,
    o.status,
    o.priority_score AS priority,
    o.topic_id AS topicId,
    t.name AS topicName,
    d.name AS domainName,
    cc.effective_coverage_score AS effective,
    cc.completion_score AS completion
  FROM alai_learning_objectives o
  LEFT JOIN curriculum_topics t ON t.id = o.topic_id
  LEFT JOIN academic_domains d ON d.id = t.domain_id
  LEFT JOIN curriculum_completion cc ON cc.domain_id = d.id
  WHERE o.status = 'OPEN'
`).all() as Objective[];

const activeFindings = db.prepare(`
  SELECT area, severity, finding, recommended_objective AS objective
  FROM alai_metacognitive_findings
  WHERE status = 'OPEN'
`).all() as {
  area: string;
  severity: string;
  finding: string;
  objective: string;
}[];

const updateObjective = db.prepare(`
  UPDATE alai_learning_objectives
  SET priority_score = ?,
      updated_at = ?
  WHERE id = ?
`);

function severityBoost(severity: string): number {
  if (severity === "CRITICAL") return 0.35;
  if (severity === "HIGH") return 0.25;
  if (severity === "MEDIUM") return 0.15;
  return 0.05;
}

function titleMatchesFinding(title: string, finding: string, objective: string): boolean {
  const t = title.toLowerCase();
  const f = finding.toLowerCase();
  const o = objective.toLowerCase();

  return (
    o.includes(t.slice(0, Math.min(20, t.length))) ||
    t.includes("verified") && o.includes("verified") ||
    t.includes("pending") && o.includes("pending") ||
    t.includes("research") && o.includes("research") ||
    ["arts", "probability", "statistics", "law", "analysis", "humanities", "engineering"]
      .some((word) => t.includes(word) && (f.includes(word) || o.includes(word)))
  );
}

let updated = 0;

for (const objective of objectives) {
  let score = 0.12;

  if (objective.objectiveType === "META_COGNITION") score += 0.25;
  if (objective.objectiveType === "STRATEGIC_DOMAIN_LEARNING") score += 0.35;
  if (objective.objectiveType === "ACTIVE_DOMAIN_LEARNING") score += 0.15;
  if (objective.objectiveType === "TOPIC_MASTERY") score += 0.08;

  if (objective.effective !== null) {
    score += Math.max(0, 1 - objective.effective) * 0.35;
  }

  if (objective.completion !== null) {
    score += Math.max(0, 1 - objective.completion) * 0.15;
  }

  for (const finding of activeFindings) {
    if (titleMatchesFinding(objective.title, finding.finding, finding.objective)) {
      score += severityBoost(finding.severity);
    }
  }

  score = Math.min(0.99, Math.max(0.05, score));

  updateObjective.run(Number(score.toFixed(3)), now, objective.id);
  updated++;
}

console.log("ALAI executive prioritizer completed.");
console.log({
  openObjectives: objectives.length,
  activeFindings: activeFindings.length,
  updated,
});

console.table(db.prepare(`
  SELECT
    o.title,
    o.objective_type AS type,
    o.priority_score AS priority,
    t.name AS topic,
    d.name AS domain
  FROM alai_learning_objectives o
  LEFT JOIN curriculum_topics t ON t.id = o.topic_id
  LEFT JOIN academic_domains d ON d.id = t.domain_id
  WHERE o.status = 'OPEN'
  ORDER BY o.priority_score DESC, o.updated_at DESC
  LIMIT 40
`).all());

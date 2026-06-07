import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_metacognitive_findings (
  id TEXT PRIMARY KEY,
  area TEXT NOT NULL,
  severity TEXT NOT NULL,
  finding TEXT NOT NULL,
  recommended_objective TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(area, finding)
);
`);

function tableColumns(table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return new Set(rows.map((row) => row.name));
}

const objectiveColumns = tableColumns("alai_learning_objectives");

function getOrCreateMetaDomainId(): string {
  const existing = db.prepare(`
    SELECT id FROM academic_domains
    WHERE lower(name) = lower('ALAI Metacognition')
    LIMIT 1
  `).get() as { id: string } | undefined;

  if (existing) return existing.id;

  const id = crypto.randomUUID();

  db.prepare(`
    INSERT INTO academic_domains (
      id, name, description, status, created_at, updated_at
    )
    VALUES (?, 'ALAI Metacognition', 'Internal domain for ALAI self-improvement objectives.', 'ACTIVE', ?, ?)
  `).run(id, now, now);

  return id;
}

function getOrCreateMetaTopicId(): string {
  const domainId = getOrCreateMetaDomainId();

  const existing = db.prepare(`
    SELECT id FROM curriculum_topics
    WHERE domain_id = ?
      AND lower(name) = lower('Self Improvement')
    LIMIT 1
  `).get(domainId) as { id: string } | undefined;

  if (existing) return existing.id;

  const id = crypto.randomUUID();

  db.prepare(`
    INSERT INTO curriculum_topics (
      id, domain_id, name, description, status, created_at, updated_at
    )
    VALUES (?, ?, 'Self Improvement', 'Internal topic for ALAI metacognitive self-improvement.', 'ACTIVE', ?, ?)
  `).run(id, domainId, now, now);

  return id;
}


function enqueueMetaObjective(objective: string, priority: number) {
  const textColumn =
    objectiveColumns.has("objective") ? "objective" :
    objectiveColumns.has("title") ? "title" :
    null;

  if (!textColumn) return;

  const existing = db.prepare(`
    SELECT id
    FROM alai_learning_objectives
    WHERE lower(${textColumn}) = lower(?)
      AND status IN ('OPEN', 'IN_PROGRESS')
    LIMIT 1
  `).get(objective);

  if (existing) return;

  const data: Record<string, unknown> = {
    id: crypto.randomUUID(),
    [textColumn]: objective,
    status: "OPEN",
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  if (objectiveColumns.has("objective_type")) data.objective_type = "META_COGNITION";
  if (objectiveColumns.has("priority_score")) data.priority_score = priority;
  if (objectiveColumns.has("mastery_target")) data.mastery_target = 0.82;
  if (objectiveColumns.has("topic_id")) data.topic_id = getOrCreateMetaTopicId();

  const keys = Object.keys(data);
  const placeholders = keys.map(() => "?").join(", ");

  db.prepare(`
    INSERT INTO alai_learning_objectives (${keys.join(", ")})
    VALUES (${placeholders})
  `).run(...keys.map((key) => data[key]));
}

function upsertFinding(area: string, severity: string, finding: string, objective: string) {
  db.prepare(`
    INSERT INTO alai_metacognitive_findings (
      id, area, severity, finding, recommended_objective, status, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?)
    ON CONFLICT(area, finding) DO UPDATE SET
      severity = excluded.severity,
      recommended_objective = excluded.recommended_objective,
      status = 'OPEN',
      updated_at = excluded.updated_at
  `).run(crypto.randomUUID(), area, severity, finding, objective, now, now);

  enqueueMetaObjective(
    objective,
    severity === "CRITICAL" ? 0.99 : severity === "HIGH" ? 0.9 : 0.75
  );
}


db.prepare(`
  UPDATE alai_metacognitive_findings
  SET status = 'RESOLVED',
      updated_at = ?
  WHERE status = 'OPEN'
`).run(now);


const health = db.prepare(`
  SELECT
    (SELECT COUNT(*) FROM concepts) AS concepts,
    (SELECT COUNT(*) FROM concepts WHERE status = 'VERIFIED') AS verified,
    (SELECT COUNT(*) FROM concepts WHERE status = 'PENDING') AS pending,
    (SELECT COUNT(*) FROM relations) AS relations,
    (SELECT COUNT(*) FROM alai_quality_flags WHERE status = 'OPEN') AS openFlags,
    (
      SELECT COUNT(*)
      FROM concept_mastery cm
      JOIN concepts c ON c.id = cm.concept_id
      WHERE c.status IN ('VERIFIED', 'CANONICAL')
        AND cm.mastery_score >= 0.82
    ) AS mastered,
    (SELECT COUNT(*) FROM alai_learning_objectives WHERE status = 'OPEN') AS openObjectives,
    (SELECT COUNT(*) FROM alai_research_questions WHERE status = 'OPEN') AS openQuestions
`).get() as {
  concepts: number;
  verified: number;
  pending: number;
  relations: number;
  openFlags: number;
  mastered: number;
  openObjectives: number;
  openQuestions: number;
};

const verifiedRatio = health.concepts === 0 ? 0 : health.verified / health.concepts;
const pendingRatio = health.concepts === 0 ? 0 : health.pending / health.concepts;

if (verifiedRatio < 0.25) {
  upsertFinding(
    "KNOWLEDGE_VALIDATION",
    "HIGH",
    `Verified ratio is too low: ${verifiedRatio.toFixed(3)}.`,
    "Increase verified knowledge ratio by prioritizing evidence-backed concepts with strong curriculum alignment."
  );
}

if (health.mastered < 10) {
  upsertFinding(
    "MASTERY",
    "CRITICAL",
    `Strict mastered concepts are too low: ${health.mastered}.`,
    "Run self-tests, autonomous exams, grounded exams, competency scoring, and strict mastery sync for high-value concepts."
  );
}

if (pendingRatio > 0.45) {
  upsertFinding(
    "PENDING_BACKLOG",
    "HIGH",
    `Pending concept ratio is high: ${pendingRatio.toFixed(3)}.`,
    "Reduce pending backlog by validating, rejecting, merging, or promoting concepts using evidence and exams."
  );
}

const weakDomains = db.prepare(`
  SELECT
    d.name,
    cc.effective_coverage_score AS effective,
    cc.known_coverage_score AS known,
    cc.total_topics AS totalTopics,
    cc.mapped_concepts AS mappedConcepts
  FROM curriculum_completion cc
  JOIN academic_domains d ON d.id = cc.domain_id
  WHERE cc.total_topics > 0
    AND cc.effective_coverage_score < 0.2
    AND d.name != 'ALAI Metacognition' 
  ORDER BY cc.effective_coverage_score ASC
  LIMIT 8
`).all() as {
  name: string;
  effective: number;
  known: number;
  totalTopics: number;
  mappedConcepts: number;
}[];

for (const domain of weakDomains) {
  upsertFinding(
    "CURRICULUM_COVERAGE",
    domain.effective === 0 ? "HIGH" : "MEDIUM",
    `${domain.name} has weak effective coverage: ${domain.effective}.`,
    `Expand and strengthen curriculum coverage for ${domain.name}: map concepts, gather evidence, create capabilities, and validate mastery.`
  );
}

const staleQuestions = db.prepare(`
  SELECT COUNT(*) AS count
  FROM alai_research_questions
  WHERE status = 'OPEN'
`).get() as { count: number };

if (staleQuestions.count > 150) {
  upsertFinding(
    "RESEARCH_QUEUE",
    "MEDIUM",
    `Research queue is large: ${staleQuestions.count} open questions.`,
    "Prioritize research questions by curriculum impact, evidence scarcity, and domain value before executing research."
  );
}

console.log("ALAI metacognition engine completed.");
console.log({
  concepts: health.concepts,
  verified: health.verified,
  pending: health.pending,
  verifiedRatio: Number(verifiedRatio.toFixed(3)),
  mastered: health.mastered,
  openObjectives: health.openObjectives,
  openQuestions: health.openQuestions,
});

console.table(db.prepare(`
  SELECT area, severity, finding, recommended_objective AS objective
  FROM alai_metacognitive_findings
  WHERE status = 'OPEN'
  ORDER BY
    CASE severity
      WHEN 'CRITICAL' THEN 0
      WHEN 'HIGH' THEN 1
      ELSE 2
    END,
    area ASC
  LIMIT 20
`).all());

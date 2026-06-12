import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_executive_brain_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  decisions_created INTEGER NOT NULL DEFAULT 0,
  actions_created INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'RUNNING'
);

CREATE TABLE IF NOT EXISTS alai_executive_decisions (
  id TEXT PRIMARY KEY,
  decision_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  target_name TEXT NOT NULL,
  priority_score REAL NOT NULL DEFAULT 0.5,
  reason TEXT NOT NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);

type Domain = {
  id: string;
  name: string;
  rollup: number;
  topics: number;
  conceptsTotal: number;
  conceptsMastered: number;
};

function insertDecision(
  decisionType: string,
  targetType: string,
  targetId: string | null,
  targetName: string,
  priority: number,
  reason: string,
  action: string
): boolean {
  const existing = db.prepare(`
    SELECT id
    FROM alai_executive_decisions
    WHERE decision_type=?
      AND target_type=?
      AND COALESCE(target_id,'')=COALESCE(?,'')
      AND status IN ('OPEN','RUNNING')
    LIMIT 1
  `).get(decisionType, targetType, targetId);

  if (existing) return false;

  const result = db.prepare(`
    INSERT INTO alai_executive_decisions (
      id, decision_type, target_type, target_id, target_name,
      priority_score, reason, action, status, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)
  `).run(
    crypto.randomUUID(),
    decisionType,
    targetType,
    targetId,
    targetName,
    priority,
    reason,
    action,
    now,
    now
  );

  return result.changes > 0;
}

function enqueueAutonomyObjective(objective: string, priority: number): boolean {
  const table = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name='autonomous_learning_queue'
  `).get();

  if (!table) return false;

  const existing = db.prepare(`
    SELECT id
    FROM autonomous_learning_queue
    WHERE lower(objective)=lower(?)
      AND status IN ('OPEN','RUNNING')
    LIMIT 1
  `).get(objective);

  if (existing) return false;

  db.prepare(`
    INSERT INTO autonomous_learning_queue (
      id, target_type, target_id, objective, priority_score, status, attempts, created_at, updated_at
    )
    VALUES (?, 'EXECUTIVE_DECISION', NULL, ?, ?, 'OPEN', 0, ?, ?)
  `).run(crypto.randomUUID(), objective, priority, now, now);

  return true;
}

const runId = crypto.randomUUID();

db.prepare(`
  INSERT INTO alai_executive_brain_runs (id, started_at, status)
  VALUES (?, ?, 'RUNNING')
`).run(runId, now);

const domains = db.prepare(`
SELECT
  d.id,
  d.name,
  COALESCE(dr.rollup_coverage_score, 0) AS rollup,
  COALESCE(dr.topics_count, 0) AS topics,
  COALESCE(dr.concepts_total, 0) AS conceptsTotal,
  COALESCE(dr.concepts_mastered, 0) AS conceptsMastered
FROM academic_domains d
LEFT JOIN domain_coverage_rollup dr ON dr.domain_id=d.id
ORDER BY rollup ASC, conceptsTotal ASC
LIMIT 15
`).all() as Domain[];

let decisionsCreated = 0;
let actionsCreated = 0;

for (const domain of domains) {
  const priority = Math.max(0.55, Math.min(0.99, 1 - domain.rollup));
  const reason = `Domain rollup=${domain.rollup}; topics=${domain.topics}; concepts=${domain.conceptsTotal}; mastered=${domain.conceptsMastered}.`;

  if (insertDecision(
    "FOCUS_WEAK_DOMAIN",
    "DOMAIN",
    domain.id,
    domain.name,
    priority,
    reason,
    `Prioritize research, curriculum mapping, and reasoning practice for ${domain.name}.`
  )) {
    decisionsCreated++;
  }

  if (enqueueAutonomyObjective(`Executive objective: strengthen ${domain.name} using research, curriculum coverage, and reasoning exams.`, priority)) {
    actionsCreated++;
  }
}

const openResearch = db.prepare(`
SELECT COUNT(*) AS n
FROM alai_research_questions
WHERE status='OPEN'
`).get() as { n: number };

if (openResearch.n > 0) {
  if (insertDecision(
    "RUN_RESEARCH_QUEUE",
    "RESEARCH",
    null,
    "Open Research Queue",
    0.88,
    `${openResearch.n} open research questions require processing.`,
    "Run research governor, executor, closure, and gap closer."
  )) {
    decisionsCreated++;
  }
}

const failedReasoning = db.prepare(`
SELECT COUNT(*) AS n
FROM alai_reasoning_challenges
WHERE status='FAILED'
`).get() as { n: number };

if (failedReasoning.n > 0) {
  if (insertDecision(
    "REPAIR_REASONING_FAILURES",
    "REASONING",
    null,
    "Reasoning Failures",
    0.82,
    `${failedReasoning.n} reasoning challenges failed.`,
    "Generate more relations and re-run reasoning breakthrough."
  )) {
    decisionsCreated++;
  }
}

db.prepare(`
  UPDATE alai_executive_brain_runs
  SET finished_at=?,
      decisions_created=?,
      actions_created=?,
      status='COMPLETED'
  WHERE id=?
`).run(new Date().toISOString(), decisionsCreated, actionsCreated, runId);

console.log("ALAI executive brain completed.");
console.log({ decisionsCreated, actionsCreated });

console.table(db.prepare(`
SELECT decision_type, target_name, priority_score, status, reason
FROM alai_executive_decisions
ORDER BY priority_score DESC, created_at ASC
LIMIT 25
`).all());

db.close();

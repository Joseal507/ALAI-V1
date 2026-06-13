import Database from "better-sqlite3";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_curriculum_autonomous_governor_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  selected_mode TEXT NOT NULL,
  reason TEXT NOT NULL,
  open_research_before INTEGER NOT NULL DEFAULT 0,
  open_flags_before INTEGER NOT NULL DEFAULT 0,
  pending_before INTEGER NOT NULL DEFAULT 0,
  weak_domains_before INTEGER NOT NULL DEFAULT 0,
  commands_run INTEGER NOT NULL DEFAULT 0,
  commands_failed INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'RUNNING'
);

CREATE TABLE IF NOT EXISTS alai_curriculum_study_objectives (
  id TEXT PRIMARY KEY,
  domain_id TEXT,
  domain_name TEXT NOT NULL,
  objective TEXT NOT NULL,
  priority_score REAL NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(domain_name, objective)
);
`);

function n(sql: string): number {
  return Number((db.prepare(sql).get() as any)?.n ?? 0);
}

function run(command: string): boolean {
  console.log(`\n========== ${command} ==========\n`);
  const result = spawnSync(command, { shell: true, stdio: "inherit", env: process.env });
  return result.status === 0;
}

const openResearch = n(`SELECT COUNT(*) AS n FROM alai_research_questions WHERE status='OPEN'`);
const openFlags = n(`SELECT COUNT(*) AS n FROM alai_quality_flags WHERE status='OPEN'`);
const pending = n(`SELECT COUNT(*) AS n FROM concepts WHERE status='PENDING'`);
const weakDomains = n(`
  SELECT COUNT(*) AS n
  FROM domain_coverage_rollup
  WHERE rollup_coverage_score < 0.72
`);

let mode = "CURRICULUM_LEARNING";
let reason = "Debt is low enough for curriculum-guided learning.";

if (openFlags > 0 || openResearch > 20 || pending > 900) {
  mode = "CONSOLIDATION";
  reason = `Cognitive debt detected: openFlags=${openFlags}, openResearch=${openResearch}, pending=${pending}.`;
} else if (weakDomains > 0) {
  mode = "WEAK_DOMAIN_STUDY";
  reason = `Weak curriculum domains detected: ${weakDomains}.`;
}

const runId = crypto.randomUUID();

db.prepare(`
INSERT INTO alai_curriculum_autonomous_governor_runs
(id, started_at, selected_mode, reason, open_research_before, open_flags_before, pending_before, weak_domains_before, status)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'RUNNING')
`).run(runId, now, mode, reason, openResearch, openFlags, pending, weakDomains);

const weakDomainRows = db.prepare(`
SELECT
  d.id,
  d.name,
  COALESCE(r.rollup_coverage_score,0) AS coverage
FROM academic_domains d
LEFT JOIN domain_coverage_rollup r ON r.domain_id=d.id
ORDER BY coverage ASC
LIMIT 12
`).all() as any[];

for (const d of weakDomainRows) {
  const coverage = Number(d.coverage || 0);
  if (coverage >= 0.85) continue;

  db.prepare(`
  INSERT OR IGNORE INTO alai_curriculum_study_objectives
  (id, domain_id, domain_name, objective, priority_score, status, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?)
  `).run(
    crypto.randomUUID(),
    d.id,
    d.name,
    `Strengthen ${d.name} by learning missing concepts, evidence, relations, applications, and mastery checks.`,
    Math.max(0.55, Math.min(0.98, 1 - coverage)),
    now,
    now
  );
}

const consolidationCommands = [
  "npm run alai:cognitive-debt-governor",
  "npm run alai:research-auto-closer",
  "npm run alai:pending-promotion-v2",
  "npm run alai:research-gap-closer",
  "npm run alai:belief-revision",
  "npm run alai:episodic-experience",
  "npm run alai:relation-court",
  "npm run alai:trace-court",
  "npm run alai:path-quality",
  "npm run model:health"
];

const learningCommands = [
  "npm run alai:weak-domain-governor-v2",
  "npm run alai:autonomous-curiosity",
  "npm run alai:world-model",
  "npm run alai:research-director",
  "npm run alai:research-governor",
  "npm run alai:research-executor",
  "npm run alai:research-auto-closer",
  "npm run alai:belief-system",
  "npm run alai:belief-revision",
  "npm run alai:episodic-experience",
  "npm run alai:relation-court",
  "npm run alai:trace-court",
  "npm run alai:path-quality",
  "npm run model:health"
];

const commands = mode === "CONSOLIDATION" ? consolidationCommands : learningCommands;

let commandsRun = 0;
let commandsFailed = 0;

for (const command of commands) {
  commandsRun++;
  if (!run(command)) commandsFailed++;
}

db.prepare(`
UPDATE alai_curriculum_autonomous_governor_runs
SET finished_at=?,
    commands_run=?,
    commands_failed=?,
    status=?
WHERE id=?
`).run(
  new Date().toISOString(),
  commandsRun,
  commandsFailed,
  commandsFailed === 0 ? "COMPLETED" : "COMPLETED_WITH_WARNINGS",
  runId
);

console.log("ALAI curriculum autonomous governor completed.");
console.log({ mode, reason, commandsRun, commandsFailed });

db.close();

if (commandsFailed > 0) process.exit(1);

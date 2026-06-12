import Database from "better-sqlite3";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_executive_action_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  decisions_scanned INTEGER NOT NULL DEFAULT 0,
  decisions_executed INTEGER NOT NULL DEFAULT 0,
  missions_created INTEGER NOT NULL DEFAULT 0,
  commands_run INTEGER NOT NULL DEFAULT 0,
  commands_failed INTEGER NOT NULL DEFAULT 0,
  decisions_closed INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'RUNNING'
);

CREATE TABLE IF NOT EXISTS alai_executive_missions (
  id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL,
  mission_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  target_name TEXT NOT NULL,
  objective TEXT NOT NULL,
  priority_score REAL NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(decision_id, objective)
);
`);

type Decision = {
  id: string;
  decisionType: string;
  targetType: string;
  targetId: string | null;
  targetName: string;
  priorityScore: number;
  reason: string;
  action: string;
};

function runCommand(command: string): boolean {
  console.log(`\n========== EXECUTIVE ACTION: ${command} ==========\n`);

  const result = spawnSync(command, {
    shell: true,
    stdio: "inherit",
    env: process.env,
  });

  return result.status === 0;
}

function createMission(decision: Decision): boolean {
  const objective =
    decision.decisionType === "FOCUS_WEAK_DOMAIN"
      ? `Execute domain strengthening mission for ${decision.targetName}: improve coverage, create research questions, map concepts, update curriculum rollups, and validate reasoning.`
      : decision.decisionType === "RUN_RESEARCH_QUEUE"
        ? "Execute open research queue until no OPEN research questions remain."
        : decision.decisionType === "REPAIR_REASONING_FAILURES"
          ? "Repair failed reasoning challenges and rerun semantic truth validation."
          : `Execute decision: ${decision.action}`;

  const result = db.prepare(`
    INSERT OR IGNORE INTO alai_executive_missions (
      id,
      decision_id,
      mission_type,
      target_type,
      target_id,
      target_name,
      objective,
      priority_score,
      status,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)
  `).run(
    crypto.randomUUID(),
    decision.id,
    decision.decisionType,
    decision.targetType,
    decision.targetId,
    decision.targetName,
    objective,
    decision.priorityScore,
    now,
    now
  );

  return result.changes > 0;
}

function closeDecision(decisionId: string) {
  db.prepare(`
    UPDATE alai_executive_decisions
    SET status='COMPLETED',
        updated_at=?
    WHERE id=?
  `).run(now, decisionId);

  db.prepare(`
    UPDATE alai_executive_missions
    SET status='COMPLETED',
        updated_at=?
    WHERE decision_id=?
      AND status='OPEN'
  `).run(now, decisionId);
}

const runId = crypto.randomUUID();

db.prepare(`
  INSERT INTO alai_executive_action_runs (
    id,
    started_at,
    status
  )
  VALUES (?, ?, 'RUNNING')
`).run(runId, now);

const decisions = db.prepare(`
SELECT
  id,
  decision_type AS decisionType,
  target_type AS targetType,
  target_id AS targetId,
  target_name AS targetName,
  priority_score AS priorityScore,
  reason,
  action
FROM alai_executive_decisions
WHERE status='OPEN'
ORDER BY priority_score DESC, created_at ASC
LIMIT 8
`).all() as Decision[];

let missionsCreated = 0;
let decisionsExecuted = 0;
let commandsRun = 0;
let commandsFailed = 0;
let decisionsClosed = 0;

for (const decision of decisions) {
  if (createMission(decision)) missionsCreated++;

  db.prepare(`
    UPDATE alai_executive_decisions
    SET status='RUNNING',
        updated_at=?
    WHERE id=?
  `).run(now, decision.id);

  const commands =
    decision.decisionType === "RUN_RESEARCH_QUEUE"
      ? [
          "npm run alai:research-gap-closer",
          "npm run alai:research-director",
          "npm run alai:research-governor",
          "npm run alai:research-executor",
          "npm run alai:research-closure",
          "npm run alai:research-gap-closer",
        ]
      : decision.decisionType === "REPAIR_REASONING_FAILURES"
        ? [
            "npm run alai:reasoning-breakthrough",
            "npm run alai:semantic-truth-cycle",
          ]
        : [
            "npm run alai:research-director",
            "npm run alai:research-governor",
            "npm run alai:research-executor",
            "npm run alai:research-closure",
            "npm run alai:research-gap-closer",
            "npm run alai:curriculum-auto-map",
            "npm run alai:curriculum-autonomy",
            "npm run curriculum:completion-sync",
            "npm run curriculum:completion",
            "npm run curriculum:rollup",
            "npm run alai:reasoning-breakthrough",
            "npm run alai:semantic-truth-cycle",
          ];

  let failed = 0;

  for (const command of commands) {
    commandsRun++;
    const ok = runCommand(command);

    if (!ok) {
      failed++;
      commandsFailed++;
    }
  }

  decisionsExecuted++;

  if (failed === 0) {
    closeDecision(decision.id);
    decisionsClosed++;
  } else {
    db.prepare(`
      UPDATE alai_executive_decisions
      SET status='OPEN',
          updated_at=?
      WHERE id=?
    `).run(now, decision.id);
  }
}

db.prepare(`
  UPDATE alai_executive_action_runs
  SET finished_at=?,
      decisions_scanned=?,
      decisions_executed=?,
      missions_created=?,
      commands_run=?,
      commands_failed=?,
      decisions_closed=?,
      status=?
  WHERE id=?
`).run(
  new Date().toISOString(),
  decisions.length,
  decisionsExecuted,
  missionsCreated,
  commandsRun,
  commandsFailed,
  decisionsClosed,
  commandsFailed === 0 ? "COMPLETED" : "COMPLETED_WITH_WARNINGS",
  runId
);

console.log("ALAI executive action engine completed.");
console.log({
  decisionsScanned: decisions.length,
  decisionsExecuted,
  missionsCreated,
  commandsRun,
  commandsFailed,
  decisionsClosed,
});

console.table(db.prepare(`
SELECT decision_type, target_name, priority_score, status
FROM alai_executive_decisions
ORDER BY priority_score DESC, created_at ASC
LIMIT 30
`).all());

db.close();

import Database from "better-sqlite3";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_architecture_experiment_runs (
  id TEXT PRIMARY KEY,
  experiment_id TEXT NOT NULL,
  status TEXT NOT NULL,
  baseline_metrics TEXT NOT NULL,
  after_metrics TEXT NOT NULL,
  command_results TEXT NOT NULL,
  score_delta REAL NOT NULL DEFAULT 0,
  decision TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`);

type Metrics = {
  concepts: number;
  pending: number;
  verified: number;
  canonical: number;
  evidence: number;
  relations: number;
  packs: number;
  autonomousExamConcepts: number;
  competencyConcepts: number;
  competencyWithoutAutonomousExam: number;
  openArchitectureFindings: number;
};

function getMetrics(): Metrics {
  return db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM concepts) AS concepts,
      (SELECT COUNT(*) FROM concepts WHERE status='PENDING') AS pending,
      (SELECT COUNT(*) FROM concepts WHERE status='VERIFIED') AS verified,
      (SELECT COUNT(*) FROM concepts WHERE status='CANONICAL') AS canonical,
      (SELECT COUNT(*) FROM evidence) AS evidence,
      (SELECT COUNT(*) FROM relations) AS relations,
      (SELECT COUNT(*) FROM canonical_concept_packs) AS packs,
      (SELECT COUNT(DISTINCT concept_id) FROM alai_autonomous_exams) AS autonomousExamConcepts,
      (SELECT COUNT(*) FROM alai_concept_competencies) AS competencyConcepts,
      (
        SELECT COUNT(*)
        FROM concepts c
        JOIN alai_concept_competencies cc ON cc.concept_id = c.id
        WHERE c.id NOT IN (
          SELECT DISTINCT concept_id FROM alai_autonomous_exams
        )
      ) AS competencyWithoutAutonomousExam,
      (SELECT COUNT(*) FROM alai_architecture_findings WHERE status='OPEN') AS openArchitectureFindings
  `).get() as Metrics;
}

function architectureScore(m: Metrics): number {
  if (m.concepts === 0) return 0;

  const pendingPenalty = m.pending / m.concepts;
  const canonicalRatio = m.canonical / m.concepts;
  const verifiedRatio = m.verified / m.concepts;
  const packRatio = m.packs / m.concepts;
  const examCoverage = m.competencyConcepts === 0
    ? 0
    : m.autonomousExamConcepts / m.competencyConcepts;
  const missingExamPenalty = m.competencyConcepts === 0
    ? 0
    : m.competencyWithoutAutonomousExam / m.competencyConcepts;

  const score =
    canonicalRatio * 0.3 +
    verifiedRatio * 0.15 +
    packRatio * 0.2 +
    examCoverage * 0.25 +
    (1 - pendingPenalty) * 0.1 -
    missingExamPenalty * 0.15;

  return Number(Math.max(0, Math.min(1, score)).toFixed(4));
}

function runCommand(command: string) {
  const startedAt = new Date().toISOString();

  const result = spawnSync(command, {
    shell: true,
    encoding: "utf8",
    stdio: "pipe",
    maxBuffer: 1024 * 1024 * 10,
  });

  return {
    command,
    status: result.status ?? 1,
    ok: result.status === 0,
    stdout: (result.stdout || "").slice(-5000),
    stderr: (result.stderr || "").slice(-5000),
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}

const experiment = db.prepare(`
  SELECT
    id,
    title,
    hypothesis,
    validation_commands AS validationCommands,
    risk_level AS riskLevel
  FROM alai_architecture_experiments
  WHERE status = 'PROPOSED'
  ORDER BY
    CASE risk_level
      WHEN 'LOW' THEN 0
      WHEN 'MEDIUM' THEN 1
      ELSE 2
    END,
    created_at ASC
  LIMIT 1
`).get() as
  | {
      id: string;
      title: string;
      hypothesis: string;
      validationCommands: string;
      riskLevel: string;
    }
  | undefined;

if (!experiment) {
  console.log("No proposed architecture experiment found.");
  process.exit(0);
}

const commands = JSON.parse(experiment.validationCommands) as string[];

console.log("Running architecture experiment:");
console.log({
  title: experiment.title,
  riskLevel: experiment.riskLevel,
  commands,
});

const baseline = getMetrics();
const baselineScore = architectureScore(baseline);

db.prepare(`
  UPDATE alai_architecture_experiments
  SET status='RUNNING',
      updated_at=?
  WHERE id=?
`).run(now, experiment.id);

const commandResults = commands.map(runCommand);
const failed = commandResults.find((result) => !result.ok);

const after = getMetrics();
const afterScore = architectureScore(after);
const scoreDelta = Number((afterScore - baselineScore).toFixed(4));

const status = failed ? "FAILED" : scoreDelta >= -0.005 ? "PASSED" : "REGRESSED";

const decision =
  failed
    ? `Rejected: command failed: ${failed.command}`
    : scoreDelta >= 0.005
      ? `Accepted: architecture score improved by ${scoreDelta}`
      : scoreDelta >= -0.005
        ? `Accepted as neutral: no meaningful regression (${scoreDelta})`
        : `Rejected: architecture score regressed by ${scoreDelta}`;

db.prepare(`
  INSERT INTO alai_architecture_experiment_runs (
    id,
    experiment_id,
    status,
    baseline_metrics,
    after_metrics,
    command_results,
    score_delta,
    decision,
    created_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  crypto.randomUUID(),
  experiment.id,
  status,
  JSON.stringify({ ...baseline, architectureScore: baselineScore }),
  JSON.stringify({ ...after, architectureScore: afterScore }),
  JSON.stringify(commandResults),
  scoreDelta,
  decision,
  new Date().toISOString()
);

db.prepare(`
  UPDATE alai_architecture_experiments
  SET status=?,
      updated_at=?
  WHERE id=?
`).run(status, new Date().toISOString(), experiment.id);

console.log("Architecture experiment completed.");
console.log({
  status,
  baselineScore,
  afterScore,
  scoreDelta,
  decision,
});

console.table(commandResults.map((result) => ({
  command: result.command,
  ok: result.ok,
  status: result.status,
})));

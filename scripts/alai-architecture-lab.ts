import Database from "better-sqlite3";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_architecture_findings (
  id TEXT PRIMARY KEY,
  area TEXT NOT NULL,
  severity TEXT NOT NULL,
  finding TEXT NOT NULL,
  evidence TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(area, finding)
);

CREATE TABLE IF NOT EXISTS alai_architecture_experiments (
  id TEXT PRIMARY KEY,
  finding_id TEXT NOT NULL,
  title TEXT NOT NULL,
  hypothesis TEXT NOT NULL,
  target_files TEXT NOT NULL,
  validation_commands TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PROPOSED',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);

function upsertFinding(input: {
  area: string;
  severity: string;
  finding: string;
  evidence: string;
  recommendation: string;
}) {
  db.prepare(`
    INSERT INTO alai_architecture_findings (
      id, area, severity, finding, evidence, recommendation, status, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)
    ON CONFLICT(area, finding) DO UPDATE SET
      severity = excluded.severity,
      evidence = excluded.evidence,
      recommendation = excluded.recommendation,
      status = 'OPEN',
      updated_at = excluded.updated_at
  `).run(
    crypto.randomUUID(),
    input.area,
    input.severity,
    input.finding,
    input.evidence,
    input.recommendation,
    now,
    now
  );

  return db.prepare(`
    SELECT id FROM alai_architecture_findings
    WHERE area = ? AND finding = ?
    LIMIT 1
  `).get(input.area, input.finding) as { id: string };
}

function createExperiment(input: {
  findingId: string;
  title: string;
  hypothesis: string;
  targetFiles: string[];
  validationCommands: string[];
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
}) {
  const existing = db.prepare(`
    SELECT id FROM alai_architecture_experiments
    WHERE finding_id = ?
      AND title = ?
      AND status IN ('PROPOSED','RUNNING')
    LIMIT 1
  `).get(input.findingId, input.title);

  if (existing) return;

  db.prepare(`
    INSERT INTO alai_architecture_experiments (
      id, finding_id, title, hypothesis, target_files, validation_commands,
      risk_level, status, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 'PROPOSED', ?, ?)
  `).run(
    crypto.randomUUID(),
    input.findingId,
    input.title,
    input.hypothesis,
    JSON.stringify(input.targetFiles),
    JSON.stringify(input.validationCommands),
    input.riskLevel,
    now,
    now
  );
}

function fileExists(file: string) {
  return fs.existsSync(path.join(process.cwd(), file));
}

function grepCount(file: string, pattern: RegExp) {
  if (!fileExists(file)) return 0;
  const text = fs.readFileSync(file, "utf8");
  return (text.match(pattern) || []).length;
}

const stats = db.prepare(`
  SELECT
    (SELECT COUNT(*) FROM concepts) AS concepts,
    (SELECT COUNT(*) FROM concepts WHERE status='PENDING') AS pending,
    (SELECT COUNT(*) FROM concepts WHERE status='VERIFIED') AS verified,
    (SELECT COUNT(*) FROM concepts WHERE status='CANONICAL') AS canonical,
    (SELECT COUNT(*) FROM relations) AS relations,
    (SELECT COUNT(*) FROM evidence) AS evidence,
    (SELECT COUNT(*) FROM canonical_concept_packs) AS packs,
    (SELECT COUNT(*) FROM alai_learning_objectives WHERE status='OPEN') AS openObjectives,
    (SELECT COUNT(*) FROM alai_metacognitive_findings WHERE status='OPEN') AS openMetaFindings
`).get() as {
  concepts: number;
  pending: number;
  verified: number;
  canonical: number;
  relations: number;
  evidence: number;
  packs: number;
  openObjectives: number;
  openMetaFindings: number;
};

const pendingRatio = stats.concepts === 0 ? 0 : stats.pending / stats.concepts;
const verifiedRatio = stats.concepts === 0 ? 0 : stats.verified / stats.concepts;
const packRatio = stats.concepts === 0 ? 0 : stats.packs / stats.concepts;

if (pendingRatio > 0.55) {
  const finding = upsertFinding({
    area: "VALIDATION_PIPELINE",
    severity: "HIGH",
    finding: `Pending concept ratio is architecturally high: ${pendingRatio.toFixed(3)}.`,
    evidence: JSON.stringify(stats),
    recommendation:
      "Improve the validation/promotion pipeline so learned concepts become verified or canonical faster.",
  });

  createExperiment({
    findingId: finding.id,
    title: "Strengthen automatic concept promotion after evidence linking",
    hypothesis:
      "If concepts with linked evidence, relations, exams, and competencies are promoted more aggressively, ALAI will reduce pending backlog without increasing noise.",
    targetFiles: [
      "scripts/alai-strict-mastery-sync.ts",
      "scripts/alai-promote-mastered-concepts.ts",
      "src/alai/alai-knowledge-governance.ts",
    ],
    validationCommands: [
      "npm run typecheck",
      "npm run alai:strict-mastery",
      "npm run alai:promote-mastered",
      "npm run model:health",
    ],
    riskLevel: "MEDIUM",
  });
}

if (packRatio < 0.25) {
  const finding = upsertFinding({
    area: "CANONICAL_MEMORY",
    severity: "HIGH",
    finding: `Canonical pack coverage is low: ${packRatio.toFixed(3)}.`,
    evidence: JSON.stringify(stats),
    recommendation:
      "Automatically build canonical packs for learned concepts with enough evidence.",
  });

  createExperiment({
    findingId: finding.id,
    title: "Auto-build canonical packs for evidence-backed concepts",
    hypothesis:
      "If ALAI compresses evidence-backed concepts into canonical packs immediately after learning, internal answers will depend less on Groq.",
    targetFiles: [
      "scripts/alai-knowledge-compression-engine.ts",
      "scripts/alai-concept-canonicalization-engine.ts",
      "src/alai/alai-canonical-pack-builder.ts",
    ],
    validationCommands: [
      "npm run typecheck",
      "npm run alai:knowledge-compression",
      "npm run alai:canonicalize-concepts",
      "npm run alai:answer -- \"que es vector\"",
    ],
    riskLevel: "LOW",
  });
}

const unifiedBrainFile = "src/alai/alai-unified-brain.ts";
const llmFallbacks = grepCount(unifiedBrainFile, /studyAI\(/g);
const internalAnswerBranches =
  grepCount(unifiedBrainFile, /INTERNAL_REASONING/g) +
  grepCount(unifiedBrainFile, /Evidence Memory Brain/g);

if (llmFallbacks > 0 && internalAnswerBranches < 5) {
  const finding = upsertFinding({
    area: "LLM_DEPENDENCY",
    severity: "MEDIUM",
    finding: "Unified brain still has limited internal answer branches before LLM fallback.",
    evidence: JSON.stringify({ unifiedBrainFile, llmFallbacks, internalAnswerBranches }),
    recommendation:
      "Add more internal answer routes: canonical pack answer, relation answer, evidence synthesis answer, and graph answer before LLM fallback.",
  });

  createExperiment({
    findingId: finding.id,
    title: "Add canonical-pack answer route before LLM fallback",
    hypothesis:
      "If ALAI checks canonical packs before calling studyAI, repeated known questions will be answered internally more often.",
    targetFiles: [
      "src/alai/alai-unified-brain.ts",
      "src/alai/alai-canonical-pack-repository.ts",
      "src/language/internal-language-renderer.ts",
    ],
    validationCommands: [
      "npm run typecheck",
      "printf 'debug on\\nque es vector\\nsalir\\n' | npm run alai:chat",
    ],
    riskLevel: "LOW",
  });
}

const answerPlannerFile = "src/reasoning/answer-planner.ts";
const hardcodedSpecialCases = grepCount(answerPlannerFile, /torque|angular momentum|what changes/g);

if (hardcodedSpecialCases > 0) {
  const finding = upsertFinding({
    area: "REASONING_ENGINE",
    severity: "MEDIUM",
    finding: "Answer planner contains topic-specific reasoning special cases.",
    evidence: JSON.stringify({ answerPlannerFile, hardcodedSpecialCases }),
    recommendation:
      "Replace topic-specific branches with general relation-pattern reasoning templates.",
  });

  createExperiment({
    findingId: finding.id,
    title: "Generalize answer planner relation templates",
    hypothesis:
      "If answer planning uses relation types instead of hardcoded topics, ALAI can reason across domains without manual patches.",
    targetFiles: [
      "src/reasoning/answer-planner.ts",
      "src/reasoning/question-reasoner.ts",
    ],
    validationCommands: [
      "npm run typecheck",
      "npm run alai:answer -- \"que relacion tiene vector con linear algebra\"",
    ],
    riskLevel: "MEDIUM",
  });
} else {
  db.prepare(`
    UPDATE alai_architecture_findings
    SET status = 'RESOLVED',
        updated_at = ?
    WHERE area = 'REASONING_ENGINE'
      AND finding = 'Answer planner contains topic-specific reasoning special cases.'
      AND status = 'OPEN'
  `).run(now);
}

console.log("ALAI Architecture Lab completed.");
console.log(stats);

console.table(db.prepare(`
  SELECT area, severity, finding, recommendation, status
  FROM alai_architecture_findings
  ORDER BY
    CASE severity
      WHEN 'CRITICAL' THEN 0
      WHEN 'HIGH' THEN 1
      WHEN 'MEDIUM' THEN 2
      ELSE 3
    END,
    updated_at DESC
`).all());

console.table(db.prepare(`
  SELECT title, hypothesis, target_files, validation_commands, risk_level, status
  FROM alai_architecture_experiments
  ORDER BY
    CASE risk_level
      WHEN 'LOW' THEN 0
      WHEN 'MEDIUM' THEN 1
      ELSE 2
    END,
    created_at DESC
`).all());

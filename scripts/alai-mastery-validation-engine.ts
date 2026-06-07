import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_mastery_validations (
  id TEXT PRIMARY KEY,
  concept_id TEXT NOT NULL,
  validation_type TEXT NOT NULL,
  passed INTEGER NOT NULL DEFAULT 0,
  score REAL NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(concept_id, validation_type),
  FOREIGN KEY (concept_id) REFERENCES concepts(id)
);
`);

function tableExists(name: string) {
  const row = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name = ?
    LIMIT 1
  `).get(name);

  return Boolean(row);
}

const hasQualityFlags = tableExists("alai_quality_flags");

const concepts = db.prepare(`
  SELECT
    c.id,
    c.name,
    c.description,
    c.confidence_score,
    c.uncertainty_score,
    COALESCE(COUNT(cel.evidence_id), 0) AS evidenceCount,
    COALESCE(SUM(
      CASE
        WHEN upper(COALESCE(e.source_type, '')) NOT IN ('INTERNAL', 'AI_INTERNAL', 'SELF_GENERATED')
        THEN 1
        ELSE 0
      END
    ), 0) AS externalEvidenceCount
  FROM concepts c
  LEFT JOIN concept_evidence_links cel ON cel.concept_id = c.id
  LEFT JOIN evidence e ON e.id = cel.evidence_id
  GROUP BY c.id
  ORDER BY c.confidence_score DESC
  LIMIT 200
`).all() as {
  id: string;
  name: string;
  description: string;
  confidence_score: number;
  uncertainty_score: number;
  evidenceCount: number;
  externalEvidenceCount: number;
}[];

const upsertValidation = db.prepare(`
  INSERT INTO alai_mastery_validations (
    id, concept_id, validation_type, passed, score, reason, created_at, updated_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(concept_id, validation_type) DO UPDATE SET
    passed = excluded.passed,
    score = excluded.score,
    reason = excluded.reason,
    updated_at = excluded.updated_at
`);

const updateConceptStatus = db.prepare(`
  UPDATE concepts
  SET status = ?,
      updated_at = ?
  WHERE id = ?
`);

function openBlockingQualityFlags(conceptId: string) {
  if (!hasQualityFlags) return [];

  return db.prepare(`
    SELECT issue_type, severity, message
    FROM alai_quality_flags
    WHERE target_type = 'CONCEPT'
      AND target_id = ?
      AND status = 'OPEN'
      AND (
        severity = 'HIGH'
        OR issue_type IN (
          'NOISE_CONCEPT',
          'NO_EVIDENCE',
          'VERIFIED_WITHOUT_EXTERNAL_EVIDENCE'
        )
      )
  `).all(conceptId) as {
    issue_type: string;
    severity: string;
    message: string;
  }[];
}

let validated = 0;
let verified = 0;
let blockedByQuality = 0;
let blockedByExternalEvidence = 0;

for (const c of concepts) {
  const blockers = openBlockingQualityFlags(c.id);
  const hasExternalEvidence = c.externalEvidenceCount > 0;

  const tests = [
    {
      type: "DEFINITION_TEST",
      score: c.description.trim().length >= 20 ? 1 : 0,
      reason: "Concept must have a usable definition.",
    },
    {
      type: "EVIDENCE_TEST",
      score: Math.min(1, c.evidenceCount / 2),
      reason: "Concept must be supported by at least two evidence links.",
    },
    {
      type: "EXTERNAL_EVIDENCE_TEST",
      score: hasExternalEvidence ? 1 : 0,
      reason: "Concept must have at least one non-internal evidence link before VERIFIED status.",
    },
    {
      type: "QUALITY_GATE_TEST",
      score: blockers.length === 0 ? 1 : 0,
      reason: blockers.length === 0
        ? "No open blocking quality flags."
        : `Blocked by quality flags: ${blockers.map((b) => b.issue_type).join(", ")}.`,
    },
    {
      type: "CONFIDENCE_TEST",
      score: c.confidence_score >= 0.7 ? 1 : c.confidence_score,
      reason: "Concept confidence must reach mastery threshold.",
    },
    {
      type: "UNCERTAINTY_TEST",
      score: c.uncertainty_score <= 0.35 ? 1 : Math.max(0, 1 - c.uncertainty_score),
      reason: "Concept uncertainty must be sufficiently low.",
    },
  ];

  let total = 0;

  for (const test of tests) {
    const passed = test.score >= 0.7 ? 1 : 0;
    total += test.score;

    upsertValidation.run(
      crypto.randomUUID(),
      c.id,
      test.type,
      passed,
      Number(test.score.toFixed(3)),
      test.reason,
      now,
      now
    );
  }

  const avg = total / tests.length;

  if (avg >= 0.75 && blockers.length === 0 && hasExternalEvidence) {
    updateConceptStatus.run("VERIFIED", now, c.id);
    verified++;
  } else {
    updateConceptStatus.run("PENDING", now, c.id);

    if (blockers.length > 0) blockedByQuality++;
    if (!hasExternalEvidence) blockedByExternalEvidence++;
  }

  validated++;
}

console.log("ALAI mastery validation engine completed.");
console.log({
  conceptsValidated: validated,
  conceptsVerified: verified,
  blockedByQuality,
  blockedByExternalEvidence,
});

console.table(db.prepare(`
  SELECT
    c.name,
    c.status,
    ROUND(AVG(v.score), 3) AS validationScore,
    SUM(v.passed) AS passedTests,
    COUNT(v.id) AS totalTests
  FROM alai_mastery_validations v
  JOIN concepts c ON c.id = v.concept_id
  GROUP BY c.id
  ORDER BY validationScore DESC, c.name ASC
  LIMIT 25
`).all());

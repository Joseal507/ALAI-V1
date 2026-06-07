import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS concept_mastery (
  id TEXT PRIMARY KEY,
  concept_id TEXT NOT NULL UNIQUE,
  mastery_score REAL NOT NULL DEFAULT 0,
  evidence_count INTEGER NOT NULL DEFAULT 0,
  relation_count INTEGER NOT NULL DEFAULT 0,
  contradiction_count INTEGER NOT NULL DEFAULT 0,
  last_calculated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (concept_id) REFERENCES concepts(id)
);
`);

const existingColumns = db.prepare(`PRAGMA table_info(concept_mastery)`).all() as { name: string }[];
const columnNames = new Set(existingColumns.map((column) => column.name));

function addColumnIfMissing(name: string, definition: string) {
  if (columnNames.has(name)) return;
  db.exec(`ALTER TABLE concept_mastery ADD COLUMN ${name} ${definition}`);
  columnNames.add(name);
}

addColumnIfMissing("mastery_level", "TEXT NOT NULL DEFAULT 'UNTESTED'");
addColumnIfMissing("evidence_score", "REAL NOT NULL DEFAULT 0");
addColumnIfMissing("relation_score", "REAL NOT NULL DEFAULT 0");
addColumnIfMissing("capability_score", "REAL NOT NULL DEFAULT 0");
addColumnIfMissing("last_evaluated_at", "TEXT NOT NULL DEFAULT ''");

type ConceptRow = {
  id: string;
  name: string;
  status: string;
  confidenceScore: number;
  evidenceCount: number;
  relationCount: number;
  capabilityCount: number;
  avgCapabilityMastery: number;
};

const rows = db.prepare(`
  SELECT
    c.id,
    c.name,
    c.status,
    c.confidence_score AS confidenceScore,
    (
      SELECT COUNT(*)
      FROM concept_evidence ce
      WHERE ce.concept_id = c.id
    ) + (
      SELECT COUNT(*)
      FROM concept_evidence_links cel
      WHERE cel.concept_id = c.id
    ) AS evidenceCount,
    (
      SELECT COUNT(*)
      FROM relations r
      WHERE r.from_concept_id = c.id
         OR r.to_concept_id = c.id
    ) AS relationCount,
    (
      SELECT COUNT(*)
      FROM capabilities cap
      WHERE cap.concept_id = c.id
    ) AS capabilityCount,
    COALESCE((
      SELECT AVG(cap.mastery_score)
      FROM capabilities cap
      WHERE cap.concept_id = c.id
    ), 0) AS avgCapabilityMastery
  FROM concepts c
`).all() as ConceptRow[];

let upserted = 0;

for (const row of rows) {
  const evidenceScore = Math.min(Math.log2(row.evidenceCount + 1) / 4, 1);
  const relationScore = Math.min(Math.log2(row.relationCount + 1) / 5, 1);
  const capabilityScore = row.capabilityCount === 0
    ? 0
    : Math.min(row.avgCapabilityMastery, 1);

  const verifiedBoost = row.status === "VERIFIED" ? 0.08 : 0;

  const baseMasteryScore = Math.min(
    1,
    evidenceScore * 0.3 +
      relationScore * 0.25 +
      capabilityScore * 0.3 +
      row.confidenceScore * 0.15 +
      verifiedBoost
  );

  const strictSignals = db.prepare(`
    SELECT
      COALESCE((
        SELECT COUNT(*)
        FROM alai_autonomous_exams ex
        WHERE ex.concept_id = ?
          AND ex.passed = 1
      ), 0) AS autonomousPassed,
      COALESCE((
        SELECT COUNT(*)
        FROM alai_evidence_grounded_exams gx
        WHERE gx.concept_id = ?
          AND gx.passed = 1
      ), 0) AS groundedPassed,
      COALESCE((
        SELECT COUNT(*)
        FROM alai_concept_self_tests st
        WHERE st.concept_id = ?
          AND st.passed = 1
      ), 0) AS selfTestsPassed
  `).get(row.id, row.id, row.id) as {
    autonomousPassed: number;
    groundedPassed: number;
    selfTestsPassed: number;
  };

  const hasStrictProof =
    row.status === "VERIFIED" &&
    row.evidenceCount >= 2 &&
    row.relationCount >= 3 &&
    (
      strictSignals.groundedPassed >= 1 ||
      strictSignals.autonomousPassed >= 2 ||
      (
        strictSignals.autonomousPassed +
        strictSignals.groundedPassed +
        strictSignals.selfTestsPassed
      ) >= 3
    );

  const masteryScore = hasStrictProof
    ? Math.max(baseMasteryScore, 0.84)
    : baseMasteryScore;

  const masteryLevel =
    hasStrictProof ? "MASTERED" :
    masteryScore >= 0.84 ? "MASTERED" :
    masteryScore >= 0.7 ? "STRONG" :
    masteryScore >= 0.52 ? "DEVELOPING" :
    "WEAK";

  db.prepare(`
    INSERT INTO concept_mastery (
      id,
      concept_id,
      mastery_score,
      evidence_count,
      relation_count,
      contradiction_count,
      last_calculated_at,
      created_at,
      updated_at,
      mastery_level,
      evidence_score,
      relation_score,
      capability_score,
      last_evaluated_at
    )
    VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(concept_id) DO UPDATE SET
      mastery_score = excluded.mastery_score,
      evidence_count = excluded.evidence_count,
      relation_count = excluded.relation_count,
      contradiction_count = excluded.contradiction_count,
      last_calculated_at = excluded.last_calculated_at,
      updated_at = excluded.updated_at,
      mastery_level = excluded.mastery_level,
      evidence_score = excluded.evidence_score,
      relation_score = excluded.relation_score,
      capability_score = excluded.capability_score,
      last_evaluated_at = excluded.last_evaluated_at
  `).run(
    crypto.randomUUID(),
    row.id,
    Number(masteryScore.toFixed(3)),
    row.evidenceCount,
    row.relationCount,
    now,
    now,
    now,
    masteryLevel,
    Number(evidenceScore.toFixed(3)),
    Number(relationScore.toFixed(3)),
    Number(capabilityScore.toFixed(3)),
    now
  );

  upserted++;
}

console.log("ALAI mastery engine completed.");
console.log({ upserted });

console.table(db.prepare(`
  SELECT
    c.name,
    c.status,
    cm.mastery_score AS mastery,
    cm.mastery_level AS level,
    cm.evidence_count AS evidenceCount,
    cm.relation_count AS relationCount,
    cm.evidence_score AS evidence,
    cm.relation_score AS relations,
    cm.capability_score AS capabilities
  FROM concept_mastery cm
  JOIN concepts c ON c.id = cm.concept_id
  ORDER BY cm.mastery_score DESC, c.name ASC
  LIMIT 30
`).all());

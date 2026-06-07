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

const rows = db.prepare(`
  SELECT
    c.id AS conceptId,
    COALESCE(cc.competency_score, 0) AS competencyScore,
    COALESCE((
      SELECT COUNT(*)
      FROM concept_evidence_links cel
      WHERE cel.concept_id = c.id
    ), 0) AS evidenceCount,
    COALESCE((
      SELECT COUNT(*)
      FROM relations r
      WHERE r.from_concept_id = c.id
         OR r.to_concept_id = c.id
    ), 0) AS relationCount,
    COALESCE((
      SELECT COUNT(*)
      FROM relations r
      WHERE (r.from_concept_id = c.id OR r.to_concept_id = c.id)
        AND r.relation_type = 'CONTRADICTS'
    ), 0) AS contradictionCount
  FROM concepts c
  LEFT JOIN alai_concept_competencies cc ON cc.concept_id = c.id
`).all() as {
  conceptId: string;
  competencyScore: number;
  evidenceCount: number;
  relationCount: number;
  contradictionCount: number;
}[];

const upsert = db.prepare(`
  INSERT INTO concept_mastery (
    id,
    concept_id,
    mastery_score,
    evidence_count,
    relation_count,
    contradiction_count,
    last_calculated_at,
    created_at,
    updated_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(concept_id) DO UPDATE SET
    mastery_score = excluded.mastery_score,
    evidence_count = excluded.evidence_count,
    relation_count = excluded.relation_count,
    contradiction_count = excluded.contradiction_count,
    last_calculated_at = excluded.last_calculated_at,
    updated_at = excluded.updated_at
`);

let synced = 0;

for (const row of rows) {
  upsert.run(
    crypto.randomUUID(),
    row.conceptId,
    Number(row.competencyScore.toFixed(3)),
    row.evidenceCount,
    row.relationCount,
    row.contradictionCount,
    now,
    now,
    now
  );

  synced++;
}

console.log("ALAI competency → mastery sync completed.");
console.log({ synced });

console.table(db.prepare(`
  SELECT
    c.name,
    cm.mastery_score AS mastery,
    cc.competency_score AS competency,
    cc.status AS competencyStatus,
    cm.relation_count AS relations,
    cm.evidence_count AS evidence
  FROM concept_mastery cm
  JOIN concepts c ON c.id = cm.concept_id
  LEFT JOIN alai_concept_competencies cc ON cc.concept_id = c.id
  ORDER BY cm.mastery_score DESC, c.name ASC
  LIMIT 25
`).all());

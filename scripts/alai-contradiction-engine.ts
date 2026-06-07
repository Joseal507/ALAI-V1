import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_quality_flags (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  issue_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'MEDIUM',
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(target_type, target_id, issue_type)
);
`);

type RelationRow = {
  id: string;
  fromId: string;
  toId: string;
  fromName: string;
  toName: string;
  relationType: string;
  confidence: number;
};

const contradictoryPairs = new Set([
  "ALIAS_OF::IS_A",
  "ALIAS_OF::PART_OF",
  "ALIAS_OF::DEPENDS_ON",
  "ALIAS_OF::INDIRECTLY_DEPENDS_ON",
]);

function pairKey(a: string, b: string) {
  return [a, b].sort().join("::");
}

function createFlag(targetId: string, severity: string, message: string) {
  const result = db.prepare(`
    INSERT OR IGNORE INTO alai_quality_flags (
      id,
      target_type,
      target_id,
      issue_type,
      severity,
      message,
      status,
      created_at,
      updated_at
    )
    VALUES (?, 'RELATION', ?, 'CONTRADICTION', ?, ?, 'OPEN', ?, ?)
  `).run(crypto.randomUUID(), targetId, severity, message, now, now);

  return result.changes > 0;
}

const relations = db.prepare(`
  SELECT
    r.id,
    r.from_concept_id AS fromId,
    r.to_concept_id AS toId,
    source.name AS fromName,
    target.name AS toName,
    r.relation_type AS relationType,
    r.confidence_score AS confidence
  FROM relations r
  JOIN concepts source ON source.id = r.from_concept_id
  JOIN concepts target ON target.id = r.to_concept_id
`).all() as RelationRow[];

let contradictions = 0;
let skipped = 0;

for (const a of relations) {
  for (const b of relations) {
    if (a.id >= b.id) continue;

    const sameDirection =
      a.fromId === b.fromId &&
      a.toId === b.toId;

    const oppositeDirection =
      a.fromId === b.toId &&
      a.toId === b.fromId;

    if (!sameDirection && !oppositeDirection) {
      skipped++;
      continue;
    }

    const key = pairKey(a.relationType, b.relationType);

    const isContradiction =
      contradictoryPairs.has(key) ||
      (
        a.relationType === "PART_OF" &&
        b.relationType === "IS_A" &&
        sameDirection
      ) ||
      (
        a.relationType === "IS_A" &&
        b.relationType === "PART_OF" &&
        sameDirection
      );

    if (!isContradiction) {
      skipped++;
      continue;
    }

    const message =
      `Investigate contradiction: ` +
      `${a.fromName} ${a.relationType} ${a.toName} ` +
      `vs ${b.fromName} ${b.relationType} ${b.toName}.`;

    const weaker = a.confidence <= b.confidence ? a : b;
    const severity = Math.abs(a.confidence - b.confidence) < 0.15 ? "HIGH" : "MEDIUM";

    if (createFlag(weaker.id, severity, message)) {
      contradictions++;

      db.prepare(`
        UPDATE relations
        SET confidence_score = MAX(0.1, confidence_score - 0.08),
            updated_at = ?
        WHERE id = ?
      `).run(now, weaker.id);

      console.log("Contradiction flagged:", message);
    } else {
      skipped++;
    }
  }
}

console.log("ALAI contradiction engine completed.");
console.log({ contradictions, skipped });

console.table(db.prepare(`
  SELECT
    issue_type AS type,
    severity,
    status,
    message
  FROM alai_quality_flags
  WHERE issue_type = 'CONTRADICTION'
  ORDER BY created_at DESC
  LIMIT 20
`).all());

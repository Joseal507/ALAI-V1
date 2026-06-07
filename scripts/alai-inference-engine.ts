import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

type RelationRow = {
  id: string;
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  relationType: string;
  confidence: number;
};

const relations = db.prepare(`
  SELECT
    r.id,
    r.from_concept_id AS fromId,
    source.name AS fromName,
    r.to_concept_id AS toId,
    target.name AS toName,
    r.relation_type AS relationType,
    r.confidence_score AS confidence
  FROM relations r
  JOIN concepts source ON source.id = r.from_concept_id
  JOIN concepts target ON target.id = r.to_concept_id
  WHERE r.confidence_score >= 0.45
`).all() as RelationRow[];

function relationExists(fromId: string, toId: string, relationType: string): boolean {
  const row = db.prepare(`
    SELECT id
    FROM relations
    WHERE from_concept_id = ?
      AND to_concept_id = ?
      AND relation_type = ?
    LIMIT 1
  `).get(fromId, toId, relationType) as { id: string } | undefined;

  return Boolean(row);
}

function insertInference(
  fromId: string,
  fromName: string,
  toId: string,
  toName: string,
  relationType: string,
  description: string,
  confidence: number
): boolean {
  if (fromId === toId) return false;
  if (relationExists(fromId, toId, relationType)) return false;

  db.prepare(`
    INSERT INTO relations (
      id,
      from_concept_id,
      to_concept_id,
      relation_type,
      description,
      confidence_score,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    fromId,
    toId,
    relationType,
    description,
    Number(confidence.toFixed(3)),
    now,
    now
  );

  console.log("Inferred:", fromName, relationType, toName, { confidence: Number(confidence.toFixed(3)) });
  return true;
}

function inferType(first: string, second: string): string | null {
  if (first === "PART_OF" && second === "PART_OF") return "INDIRECTLY_DEPENDS_ON";
  if (first === "DEPENDS_ON" && second === "DEPENDS_ON") return "INDIRECTLY_DEPENDS_ON";
  if (first === "PREREQUISITE_FOR" && second === "PREREQUISITE_FOR") return "INDIRECTLY_DEPENDS_ON";
  if (first === "FOUNDATION_FOR" && second === "PREREQUISITE_FOR") return "INDIRECTLY_DEPENDS_ON";
  // Do not infer INDIRECTLY_RELATED_TO automatically.
  // It creates weak associative noise and should only be learned from direct evidence.
  return null;
}

let inferred = 0;
let skipped = 0;

for (const first of relations) {
  for (const second of relations) {
    if (first.toId !== second.fromId) continue;
    if (first.fromId === second.toId) {
      skipped++;
      continue;
    }

    const inferredType = inferType(first.relationType, second.relationType);

    if (!inferredType) {
      skipped++;
      continue;
    }

    const confidence = Math.min(first.confidence, second.confidence) * 0.72;

    if (confidence < 0.35) {
      skipped++;
      continue;
    }

    const description =
      `Inferred because ${first.fromName} ${first.relationType} ${first.toName}, ` +
      `and ${second.fromName} ${second.relationType} ${second.toName}.`;

    const inserted = insertInference(
      first.fromId,
      first.fromName,
      second.toId,
      second.toName,
      inferredType,
      description,
      confidence
    );

    if (inserted) inferred++;
    else skipped++;
  }
}

console.log("ALAI inference engine completed.");
console.log({ inferred, skipped });

console.table(db.prepare(`
  SELECT
    source.name AS fromConcept,
    r.relation_type AS relationType,
    target.name AS toConcept,
    r.confidence_score AS confidence
  FROM relations r
  JOIN concepts source ON source.id = r.from_concept_id
  JOIN concepts target ON target.id = r.to_concept_id
  WHERE r.relation_type IN ('INDIRECTLY_DEPENDS_ON', 'INDIRECTLY_RELATED_TO')
  ORDER BY r.updated_at DESC
  LIMIT 30
`).all());

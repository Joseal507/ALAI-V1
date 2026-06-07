import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

type Concept = {
  id: string;
  name: string;
  status: string;
  confidence: number;
};

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function singularize(name: string): string {
  const value = normalizeName(name);

  const irregular: Record<string, string> = {
    animals: "animal",
    colors: "color",
    shapes: "shape",
    numbers: "number",
    words: "word",
  };

  if (irregular[value]) return irregular[value];

  if (value.endsWith("ies")) return value.slice(0, -3) + "y";
  if (value.endsWith("ses")) return value.slice(0, -2);
  if (value.endsWith("s") && !value.endsWith("ss")) return value.slice(0, -1);

  return value;
}

function rankStatus(status: string): number {
  if (status === "CANONICAL") return 3;
  if (status === "VERIFIED") return 2;
  if (status === "PENDING") return 1;
  return 0;
}

function chooseCanonical(a: Concept, b: Concept): Concept {
  const statusDiff = rankStatus(b.status) - rankStatus(a.status);
  if (statusDiff > 0) return b;
  if (statusDiff < 0) return a;

  if (b.confidence > a.confidence) return b;
  if (a.confidence > b.confidence) return a;

  return a.name.length <= b.name.length ? a : b;
}

function ensureAlias(canonicalId: string, alias: string) {
  const existing = db.prepare(`
    SELECT id
    FROM concept_aliases
    WHERE concept_id = ?
      AND lower(alias) = lower(?)
    LIMIT 1
  `).get(canonicalId, alias) as { id: string } | undefined;

  if (existing) return;

  db.prepare(`
    INSERT INTO concept_aliases (
      id,
      concept_id,
      alias,
      created_at
    )
    VALUES (?, ?, ?, ?)
  `).run(crypto.randomUUID(), canonicalId, alias, now);
}

function mergeConcept(source: Concept, target: Concept) {
  db.prepare(`
    UPDATE OR IGNORE concept_evidence
    SET concept_id = ?
    WHERE concept_id = ?
  `).run(target.id, source.id);

  db.prepare(`
    DELETE FROM concept_evidence
    WHERE concept_id = ?
  `).run(source.id);

  const hasEvidenceLinks = db.prepare(`
    SELECT COUNT(*) AS count
    FROM sqlite_master
    WHERE type = 'table'
      AND name = 'concept_evidence_links'
  `).get() as { count: number };

  if (hasEvidenceLinks.count > 0) {
    db.prepare(`
      UPDATE OR IGNORE concept_evidence_links
      SET concept_id = ?
      WHERE concept_id = ?
    `).run(target.id, source.id);

    db.prepare(`
      DELETE FROM concept_evidence_links
      WHERE concept_id = ?
    `).run(source.id);
  }

  db.prepare(`
    UPDATE relations
    SET from_concept_id = ?, updated_at = ?
    WHERE from_concept_id = ?
  `).run(target.id, now, source.id);

  db.prepare(`
    UPDATE relations
    SET to_concept_id = ?, updated_at = ?
    WHERE to_concept_id = ?
  `).run(target.id, now, source.id);

  db.prepare(`
    UPDATE OR IGNORE capabilities
    SET concept_id = ?, updated_at = ?
    WHERE concept_id = ?
  `).run(target.id, now, source.id);

  db.prepare(`
    DELETE FROM capabilities
    WHERE concept_id = ?
  `).run(source.id);

  db.prepare(`
    UPDATE OR IGNORE concept_mastery
    SET concept_id = ?, updated_at = ?
    WHERE concept_id = ?
  `).run(target.id, now, source.id);

  db.prepare(`
    DELETE FROM concept_mastery
    WHERE concept_id = ?
  `).run(source.id);

  db.prepare(`
    UPDATE OR IGNORE topic_concepts
    SET concept_id = ?
    WHERE concept_id = ?
  `).run(target.id, source.id);

  db.prepare(`
    DELETE FROM topic_concepts
    WHERE concept_id = ?
  `).run(source.id);

  db.prepare(`
    UPDATE knowledge_gaps
    SET concept_id = ?, updated_at = ?
    WHERE concept_id = ?
  `).run(target.id, now, source.id);

  const conceptReferenceUpdates: Array<[string, string]> = [
    ["alai_autonomous_exams", "concept_id"],
    ["alai_concept_competencies", "concept_id"],
    ["alai_concept_self_tests", "concept_id"],
    ["alai_evidence_grounded_exams", "concept_id"],
    ["alai_mastery_validations", "concept_id"],
    ["common_errors", "concept_id"],
    ["concept_stage_flags", "concept_id"],
  ];

  for (const [table, column] of conceptReferenceUpdates) {
    db.prepare(`
      UPDATE OR IGNORE ${table}
      SET ${column} = ?
      WHERE ${column} = ?
    `).run(target.id, source.id);

    db.prepare(`
      DELETE FROM ${table}
      WHERE ${column} = ?
    `).run(source.id);
  }

  db.prepare(`
    UPDATE OR IGNORE concept_prerequisites
    SET concept_id = ?
    WHERE concept_id = ?
  `).run(target.id, source.id);

  db.prepare(`
    UPDATE OR IGNORE concept_prerequisites
    SET prerequisite_concept_id = ?
    WHERE prerequisite_concept_id = ?
  `).run(target.id, source.id);

  db.prepare(`
    DELETE FROM concept_prerequisites
    WHERE concept_id = ?
       OR prerequisite_concept_id = ?
  `).run(source.id, source.id);

  ensureAlias(target.id, source.name);

  db.prepare(`
    DELETE FROM relations
    WHERE from_concept_id = to_concept_id
  `).run();

  db.prepare(`
    DELETE FROM concepts
    WHERE id = ?
  `).run(source.id);
}

const concepts = db.prepare(`
  SELECT
    id,
    name,
    status,
    confidence_score AS confidence
  FROM concepts
  ORDER BY name ASC
`).all() as Concept[];

const buckets = new Map<string, Concept[]>();

for (const concept of concepts) {
  const key = singularize(concept.name);
  const list = buckets.get(key) ?? [];
  list.push(concept);
  buckets.set(key, list);
}

let merged = 0;
let skipped = 0;
const mergedRows: { source: string; target: string; key: string }[] = [];

for (const [key, group] of buckets.entries()) {
  if (group.length < 2) {
    skipped++;
    continue;
  }

  let canonical = group[0];

  for (const candidate of group.slice(1)) {
    canonical = chooseCanonical(canonical, candidate);
  }

  for (const candidate of group) {
    if (candidate.id === canonical.id) continue;

    mergeConcept(candidate, canonical);
    merged++;
    mergedRows.push({
      source: candidate.name,
      target: canonical.name,
      key,
    });
  }
}

console.log("ALAI concept canonicalization completed.");
console.log({ merged, skipped });
console.table(mergedRows);

console.table(db.prepare(`
  SELECT
    c.name,
    c.status,
    c.confidence_score AS confidence,
    GROUP_CONCAT(a.alias, ', ') AS aliases
  FROM concepts c
  LEFT JOIN concept_aliases a ON a.concept_id = c.id
  GROUP BY c.id
  HAVING aliases IS NOT NULL
  ORDER BY c.name
`).all());

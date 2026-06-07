import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

type ConceptRow = {
  id: string;
  name: string;
  status: string;
  confidenceScore: number;
};

type CountRow = {
  count: number;
};

const db = new Database("data/alai.db");

function now() {
  return new Date().toISOString();
}

function relationCount(conceptId: string): number {
  const row = db.prepare(`
    SELECT COUNT(*) AS count
    FROM relations
    WHERE from_concept_id = ?
       OR to_concept_id = ?
  `).get(conceptId, conceptId) as CountRow;

  return row.count;
}

function evidenceCount(conceptId: string): number {
  const direct = db.prepare(`
    SELECT COUNT(*) AS count
    FROM concept_evidence
    WHERE concept_id = ?
  `).get(conceptId) as CountRow;

  const hasLinks = db.prepare(`
    SELECT COUNT(*) AS count
    FROM sqlite_master
    WHERE type = 'table'
      AND name = 'concept_evidence_links'
  `).get() as CountRow;

  if (hasLinks.count === 0) return direct.count;

  const linked = db.prepare(`
    SELECT COUNT(*) AS count
    FROM concept_evidence_links
    WHERE concept_id = ?
  `).get(conceptId) as CountRow;

  return direct.count + linked.count;
}

function capabilityExists(conceptId: string, type: string): boolean {
  const row = db.prepare(`
    SELECT COUNT(*) AS count
    FROM capabilities
    WHERE concept_id = ?
      AND capability_type = ?
  `).get(conceptId, type) as CountRow;

  return row.count > 0;
}

function addCapability(concept: ConceptRow, type: string, description: string, masteryScore: number) {
  if (capabilityExists(concept.id, type)) return false;

  db.prepare(`
    INSERT INTO capabilities (
      id,
      concept_id,
      capability_type,
      description,
      mastery_score,
      last_tested_at,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    concept.id,
    type,
    description,
    masteryScore,
    now(),
    now(),
    now()
  );

  return true;
}

const concepts = db.prepare(`
  SELECT
    id,
    name,
    status,
    confidence_score AS confidenceScore
  FROM concepts
  WHERE confidence_score >= 0.45
`).all() as ConceptRow[];

let created = 0;
let skipped = 0;

for (const concept of concepts) {
  const evidence = evidenceCount(concept.id);
  const relations = relationCount(concept.id);

  const eligible =
    concept.status === "VERIFIED" ||
    concept.confidenceScore >= 0.55 ||
    evidence >= 1 ||
    relations >= 1;

  if (!eligible) {
    skipped++;
    continue;
  }

  const baseMastery =
    concept.status === "VERIFIED"
      ? 0.72
      : Math.min(0.68, Math.max(0.45, concept.confidenceScore));

  const madeExplain = addCapability(
    concept,
    "EXPLAIN",
    `Explain what ${concept.name} means using clear language and an age-appropriate example.`,
    baseMastery
  );

  const madeIdentify = addCapability(
    concept,
    "IDENTIFY",
    `Identify ${concept.name} in simple examples, related ideas, or learning materials.`,
    baseMastery
  );

  const madeConnect = addCapability(
    concept,
    "CONNECT",
    `Connect ${concept.name} to prerequisite, related, or applied concepts in the knowledge graph.`,
    Math.max(0.4, baseMastery - 0.05)
  );

  const madeAny = madeExplain || madeIdentify || madeConnect;

  if (madeAny) created += Number(madeExplain) + Number(madeIdentify) + Number(madeConnect);
  else skipped++;
}

console.log("Basic capability generation completed.");
console.log({ created, skipped });

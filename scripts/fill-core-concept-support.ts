import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

function uuid() {
  return crypto.randomUUID();
}

function getConcept(name: string) {
  return db.prepare(`
    SELECT id, name
    FROM concepts
    WHERE lower(name) = lower(?)
    LIMIT 1
  `).get(name) as { id: string; name: string } | undefined;
}

function getOrCreateConcept(name: string, description: string) {
  const existing = getConcept(name);
  if (existing) return existing.id;

  const id = uuid();
  db.prepare(`
    INSERT INTO concepts (
      id, name, description, status,
      confidence_score, uncertainty_score, created_at, updated_at
    )
    VALUES (?, ?, ?, 'PENDING', 0.45, 0.55, ?, ?)
  `).run(id, name, description, now, now);

  return id;
}

function addEvidence(conceptName: string) {
  const concept = getConcept(conceptName);
  if (!concept) return false;

  const existing = db.prepare(`
    SELECT COUNT(*) AS count
    FROM concept_evidence_links
    WHERE concept_id = ?
  `).get(concept.id) as { count: number };

  if (existing.count > 0) return false;

  const evidenceId = uuid();

  db.prepare(`
    INSERT INTO evidence (
      id, source_type, source_name, source_url,
      content_summary, reliability_score, captured_at
    )
    VALUES (?, 'CURRICULUM_SEED', ?, NULL, ?, 0.72, ?)
  `).run(
    evidenceId,
    `Seeded curriculum support for ${conceptName}`,
    `${conceptName} is included as a core concept in the internal curriculum map and requires structured learning support.`,
    now
  );

  db.prepare(`
    INSERT OR IGNORE INTO concept_evidence_links (
      evidence_id, concept_id, confidence_score, created_at
    )
    VALUES (?, ?, 0.55, ?)
  `).run(evidenceId, concept.id, now);

  return true;
}

function addCapability(conceptName: string, type: string, description: string) {
  const concept = getConcept(conceptName);
  if (!concept) return false;

  const existing = db.prepare(`
    SELECT COUNT(*) AS count
    FROM capabilities
    WHERE concept_id = ?
      AND capability_type = ?
  `).get(concept.id, type) as { count: number };

  if (existing.count > 0) return false;

  db.prepare(`
    INSERT INTO capabilities (
      id, concept_id, capability_type, description,
      mastery_score, last_tested_at, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, 0.55, ?, ?, ?)
  `).run(uuid(), concept.id, type, description, now, now, now);

  return true;
}

function addRelation(fromName: string, toName: string, type: string, description: string) {
  const fromId = getOrCreateConcept(fromName, `Support concept for ${fromName}.`);
  const toId = getOrCreateConcept(toName, `Support concept for ${toName}.`);

  const existing = db.prepare(`
    SELECT COUNT(*) AS count
    FROM relations
    WHERE from_concept_id = ?
      AND to_concept_id = ?
      AND relation_type = ?
  `).get(fromId, toId, type) as { count: number };

  if (existing.count > 0) return false;

  db.prepare(`
    INSERT INTO relations (
      id, from_concept_id, to_concept_id, relation_type,
      description, confidence_score, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, 0.58, ?, ?)
  `).run(uuid(), fromId, toId, type, description, now, now);

  return true;
}

const supportRelations: [string, string, string, string][] = [
  ["Subgroup", "Group", "PART_OF", "A subgroup is a group contained within a larger group."],
  ["Span", "Vector Spaces", "PART_OF", "Span is a core idea used to describe vector spaces."],
  ["Scalar", "Vector Spaces", "PART_OF", "Scalars are used in vector spaces to scale vectors."],
  ["Linear Independence", "Vector Spaces", "PART_OF", "Linear independence is a core concept in vector spaces."],
  ["Basis", "Vector Spaces", "PART_OF", "A basis describes a vector space through independent spanning vectors."],
  ["Group", "Group Theory", "PART_OF", "Groups are the central objects studied in group theory."],
  ["Identity Element", "Group", "PART_OF", "An identity element is part of the structure of a group."],
  ["Associativity", "Group", "PART_OF", "Associativity is one of the defining properties of a group operation."],
  ["Operation", "Group", "PART_OF", "A group operation combines elements according to group structure."],
  ["Shapes", "Shape", "RELATED_TO", "Shapes is the curriculum topic form of the concept Shape."],
  ["Colors", "Color", "RELATED_TO", "Colors is the curriculum topic form of the concept Color."],
  ["Body Parts", "Body", "PART_OF", "Body parts are parts of the body."],
  ["Reading", "Words", "DEPENDS_ON", "Reading depends on recognizing and understanding words."],
  ["Writing", "Words", "DEPENDS_ON", "Writing depends on using words and sentences."],
  ["Basic Science", "Living and Nonliving Things", "RELATED_TO", "Basic science includes living and nonliving things."],
  ["Basic Arithmetic", "Numbers", "DEPENDS_ON", "Basic arithmetic depends on understanding numbers."],
  ["Social Skills", "Emotions", "RELATED_TO", "Social skills are related to understanding emotions."],
];

const targetNames = new Set<string>();
for (const [from, to] of supportRelations) {
  targetNames.add(from);
  targetNames.add(to);
}

let evidenceCreated = 0;
let capabilitiesCreated = 0;
let relationsCreated = 0;

for (const name of targetNames) {
  if (addEvidence(name)) evidenceCreated++;

  if (addCapability(name, "EXPLAIN", `Explain ${name} clearly with a simple example.`)) capabilitiesCreated++;
  if (addCapability(name, "IDENTIFY", `Identify ${name} in learning materials or examples.`)) capabilitiesCreated++;
  if (addCapability(name, "CONNECT", `Connect ${name} to related concepts in the curriculum graph.`)) capabilitiesCreated++;
}

for (const [from, to, type, description] of supportRelations) {
  if (addRelation(from, to, type, description)) relationsCreated++;
}

console.log("Core concept support fill completed.");
console.log({ evidenceCreated, capabilitiesCreated, relationsCreated });

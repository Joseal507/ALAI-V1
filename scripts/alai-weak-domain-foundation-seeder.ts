import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

function id() { return crypto.randomUUID(); }

function getDomain(name: string) {
  return db.prepare(`SELECT id FROM academic_domains WHERE lower(name)=lower(?) LIMIT 1`).get(name) as { id: string } | undefined;
}

function upsertTopic(domain: string, topic: string) {
  const d = getDomain(domain);
  if (!d) return null;

  const existing = db.prepare(`
    SELECT id FROM curriculum_topics
    WHERE domain_id=? AND lower(name)=lower(?)
    LIMIT 1
  `).get(d.id, topic) as { id: string } | undefined;

  if (existing) return existing.id;

  const topicId = id();
  db.prepare(`
    INSERT INTO curriculum_topics (id, domain_id, name, description, status, confidence_score, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'PENDING', 0.55, ?, ?)
  `).run(topicId, d.id, topic, `Foundational topic for ${domain}: ${topic}.`, now, now);

  return topicId;
}

function upsertConcept(name: string, description: string) {
  const existing = db.prepare(`SELECT id FROM concepts WHERE lower(name)=lower(?) LIMIT 1`).get(name) as { id: string } | undefined;
  if (existing) return existing.id;

  const conceptId = id();
  db.prepare(`
    INSERT INTO concepts (
      id, name, description, status,
      confidence_score, uncertainty_score, created_at, updated_at
    )
    VALUES (?, ?, ?, 'PENDING', 0.62, 0.38, ?, ?)
  `).run(conceptId, name, description, now, now);

  return conceptId;
}

function linkTopic(topicId: string, conceptId: string) {
  db.prepare(`
    INSERT OR IGNORE INTO topic_concepts (topic_id, concept_id, confidence_score, created_at)
    VALUES (?, ?, 0.62, ?)
  `).run(topicId, conceptId, now);
}

function relation(from: string, to: string, type: string, description: string) {
  const fromId = upsertConcept(from, `${from} is a foundational concept.`);
  const toId = upsertConcept(to, `${to} is a foundational concept.`);

  const exists = db.prepare(`
    SELECT id FROM relations
    WHERE from_concept_id=? AND to_concept_id=? AND relation_type=?
    LIMIT 1
  `).get(fromId, toId, type);

  if (exists || fromId === toId) return false;

  db.prepare(`
    INSERT INTO relations (
      id, from_concept_id, to_concept_id, relation_type,
      description, confidence_score, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, 0.64, ?, ?)
  `).run(id(), fromId, toId, type, description, now, now);

  return true;
}

const plan: Record<string, string[]> = {
  Probability: [
    "Sample Space", "Event", "Probability", "Conditional Probability",
    "Independent Events", "Random Variable", "Expected Value", "Probability Distribution"
  ],
  Statistics: [
    "Data", "Dataset", "Mean", "Median", "Mode", "Variance",
    "Standard Deviation", "Sampling", "Distribution", "Data Visualization"
  ],
  Arts: [
    "Visual Arts", "Composition", "Color Theory", "Design", "Art History",
    "Music", "Creativity", "Aesthetic Judgment"
  ],
};

let topics = 0;
let concepts = 0;
let relations = 0;

for (const [domain, items] of Object.entries(plan)) {
  for (const item of items) {
    const topicId = upsertTopic(domain, item);
    if (!topicId) continue;
    topics++;

    const conceptId = upsertConcept(
      item,
      `${item} is a foundational concept in ${domain}.`
    );
    concepts++;

    linkTopic(topicId, conceptId);
    if (relation(item, domain, "PART_OF", `${item} is part of ${domain}.`)) relations++;
  }

  for (let i = 0; i < items.length - 1; i++) {
    if (relation(items[i], items[i + 1], "RELATED_TO", `${items[i]} is related to ${items[i + 1]} in ${domain}.`)) {
      relations++;
    }
  }
}

console.log("ALAI weak domain foundation seeder completed.");
console.log({ topics, concepts, relations });

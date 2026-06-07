import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

function id() {
  return crypto.randomUUID();
}

function getOrCreateDomain(name: string) {
  const existing = db.prepare(`SELECT id FROM academic_domains WHERE name = ? LIMIT 1`).get(name) as { id: string } | undefined;
  if (existing) return existing.id;

  const newId = id();
  db.prepare(`
    INSERT INTO academic_domains (
      id, name, parent_domain_id, description, depth, status, confidence_score, created_at, updated_at
    )
    VALUES (?, ?, NULL, ?, 0, 'PENDING', 0.35, ?, ?)
  `).run(newId, name, "Primary foundational curriculum domain.", now, now);

  return newId;
}

function getOrCreateTopic(name: string, domainId: string, parentTopicId: string | null, description: string) {
  const existing = db.prepare(`
    SELECT id FROM curriculum_topics
    WHERE name = ?
      AND COALESCE(domain_id, '') = COALESCE(?, '')
    LIMIT 1
  `).get(name, domainId) as { id: string } | undefined;

  if (existing) return existing.id;

  const depth = parentTopicId
    ? ((db.prepare(`SELECT depth FROM curriculum_topics WHERE id = ?`).get(parentTopicId) as { depth: number } | undefined)?.depth ?? -1) + 1
    : 0;

  const newId = id();

  db.prepare(`
    INSERT INTO curriculum_topics (
      id, education_level_id, domain_id, parent_topic_id,
      name, description, depth, status, confidence_score,
      expansion_status, created_at, updated_at
    )
    VALUES (?, NULL, ?, ?, ?, ?, ?, 'PENDING', 0.35, 'OPEN', ?, ?)
  `).run(newId, domainId, parentTopicId, name, description, depth, now, now);

  return newId;
}

function getOrCreateConcept(name: string, description: string) {
  const existing = db.prepare(`SELECT id FROM concepts WHERE lower(name) = lower(?) LIMIT 1`).get(name) as { id: string } | undefined;
  if (existing) return existing.id;

  const newId = id();
  db.prepare(`
    INSERT INTO concepts (
      id, name, description, status, confidence_score, uncertainty_score, created_at, updated_at
    )
    VALUES (?, ?, ?, 'PENDING', 0.32, 0.68, ?, ?)
  `).run(newId, name, description, now, now);

  return newId;
}

function linkTopicConcept(topicId: string, conceptId: string) {
  db.prepare(`
    INSERT OR IGNORE INTO topic_concepts (topic_id, concept_id, confidence_score, created_at)
    VALUES (?, ?, 0.35, ?)
  `).run(topicId, conceptId, now);
}

function linkPrerequisite(topicName: string, prerequisiteName: string) {
  const topic = db.prepare(`SELECT id FROM curriculum_topics WHERE name = ? LIMIT 1`).get(topicName) as { id: string } | undefined;
  const pre = db.prepare(`SELECT id FROM curriculum_topics WHERE name = ? LIMIT 1`).get(prerequisiteName) as { id: string } | undefined;
  if (!topic || !pre) return;

  db.prepare(`
    INSERT OR IGNORE INTO topic_prerequisites (
      topic_id, prerequisite_topic_id, confidence_score, created_at
    )
    VALUES (?, ?, 0.4, ?)
  `).run(topic.id, pre.id, now);
}

const domainId = getOrCreateDomain("Primary Foundations");

const rootId = getOrCreateTopic(
  "Primary Foundations",
  domainId,
  null,
  "Primary school foundations: literacy, arithmetic, basic science, social knowledge, and early reasoning."
);

const topics = [
  ["Reading", ["Reading", "Letter sounds", "Phonics", "Vocabulary", "Story"]],
  ["Writing", ["Writing", "Handwriting", "Spelling", "Sentence", "Paragraph"]],
  ["Basic Arithmetic", ["Arithmetic", "Digit", "Place value", "Operation", "Equation"]],
  ["Addition", ["Addition", "Sum", "Plus", "Addend", "Total"]],
  ["Subtraction", ["Subtraction", "Difference", "Minus", "Take away"]],
  ["Multiplication", ["Multiplication", "Times", "Group", "Repeated addition"]],
  ["Division", ["Division", "Share", "Equal groups", "Quotient"]],
  ["Measurement", ["Measurement", "Length", "Weight", "Height", "Unit"]],
  ["Time", ["Time", "Clock", "Hour", "Minute", "Day"]],
  ["Money", ["Money", "Coin", "Bill", "Price", "Value"]],
  ["Basic Science", ["Science", "Living thing", "Plant", "Weather", "Experiment"]],
  ["Basic Geography", ["Geography", "Map", "Land", "Water", "Place"]],
  ["Basic History", ["History", "Past", "Present", "Timeline", "Event"]],
  ["Health and Safety", ["Health", "Safety", "Clean", "Danger", "Help"]],
  ["Social Skills", ["Respect", "Cooperation", "Rule", "Community", "Responsibility"]],
] as const;

for (const [topicName, concepts] of topics) {
  const topicId = getOrCreateTopic(
    topicName,
    domainId,
    rootId,
    `Primary foundation topic: ${topicName}.`
  );

  for (const concept of concepts) {
    linkTopicConcept(
      topicId,
      getOrCreateConcept(concept, `Primary foundational concept: ${concept}.`)
    );
  }
}

linkPrerequisite("Writing", "Reading");
linkPrerequisite("Addition", "Basic Arithmetic");
linkPrerequisite("Subtraction", "Addition");
linkPrerequisite("Multiplication", "Addition");
linkPrerequisite("Division", "Multiplication");
linkPrerequisite("Money", "Addition");
linkPrerequisite("Time", "Counting");
linkPrerequisite("Measurement", "Comparison");

console.log("Primary Foundations curriculum seeded.");
console.log({
  domain: "Primary Foundations",
  rootTopic: "Primary Foundations",
  subtopics: topics.length,
});

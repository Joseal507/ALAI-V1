import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

function uuid() {
  return crypto.randomUUID();
}

function getTopic(name: string) {
  return db.prepare(`
    SELECT id, name, domain_id, depth
    FROM curriculum_topics
    WHERE name = ?
    LIMIT 1
  `).get(name) as { id: string; name: string; domain_id: string; depth: number } | undefined;
}

function getOrCreateTopic(name: string, parentName: string, description: string) {
  const parent = getTopic(parentName);
  if (!parent) return null;

  const existing = db.prepare(`
    SELECT id
    FROM curriculum_topics
    WHERE name = ?
      AND parent_topic_id = ?
    LIMIT 1
  `).get(name, parent.id) as { id: string } | undefined;

  if (existing) return existing.id;

  const id = uuid();

  db.prepare(`
    INSERT INTO curriculum_topics (
      id, education_level_id, domain_id, parent_topic_id,
      name, description, depth, status, confidence_score,
      expansion_status, created_at, updated_at
    )
    VALUES (?, NULL, ?, ?, ?, ?, ?, 'PENDING', 0.35, 'OPEN', ?, ?)
  `).run(
    id,
    parent.domain_id,
    parent.id,
    name,
    description,
    parent.depth + 1,
    now,
    now
  );

  return id;
}

function getOrCreateConcept(name: string, description: string) {
  const existing = db.prepare(`
    SELECT id
    FROM concepts
    WHERE lower(name) = lower(?)
    LIMIT 1
  `).get(name) as { id: string } | undefined;

  if (existing) return existing.id;

  const id = uuid();

  db.prepare(`
    INSERT INTO concepts (
      id, name, description, status,
      confidence_score, uncertainty_score, created_at, updated_at
    )
    VALUES (?, ?, ?, 'PENDING', 0.3, 0.7, ?, ?)
  `).run(id, name, description, now, now);

  return id;
}

function linkTopicConcept(topicId: string, conceptId: string) {
  db.prepare(`
    INSERT OR IGNORE INTO topic_concepts (
      topic_id, concept_id, confidence_score, created_at
    )
    VALUES (?, ?, 0.35, ?)
  `).run(topicId, conceptId, now);
}

function linkPrerequisite(topicName: string, prerequisiteName: string) {
  const topic = getTopic(topicName);
  const prerequisite = getTopic(prerequisiteName);
  if (!topic || !prerequisite) return;

  db.prepare(`
    INSERT OR IGNORE INTO topic_prerequisites (
      topic_id, prerequisite_topic_id, confidence_score, created_at
    )
    VALUES (?, ?, 0.4, ?)
  `).run(topic.id, prerequisite.id, now);
}

const expansionRules: Record<string, {
  children: { name: string; concepts: string[] }[];
}> = {
  "Addition": {
    children: [
      { name: "Addition Facts", concepts: ["Add within 10", "Add within 20", "Doubles", "Near doubles"] },
      { name: "Addition Word Problems", concepts: ["Join problems", "Result unknown", "Change unknown", "Start unknown"] },
    ],
  },
  "Subtraction": {
    children: [
      { name: "Subtraction Facts", concepts: ["Subtract within 10", "Subtract within 20", "Difference facts"] },
      { name: "Subtraction Word Problems", concepts: ["Take away problems", "Compare problems", "Missing part"] },
    ],
  },
  "Multiplication": {
    children: [
      { name: "Multiplication Facts", concepts: ["Times table", "Factor", "Product", "Arrays"] },
      { name: "Repeated Addition", concepts: ["Equal groups", "Skip counting", "Repeated groups"] },
    ],
  },
  "Division": {
    children: [
      { name: "Division Facts", concepts: ["Dividend", "Divisor", "Quotient", "Remainder"] },
      { name: "Equal Sharing", concepts: ["Share equally", "Group size", "Number of groups"] },
    ],
  },
  "Reading": {
    children: [
      { name: "Phonics", concepts: ["Letter sound", "Blend", "Decode", "Syllable"] },
      { name: "Reading Comprehension", concepts: ["Main idea", "Detail", "Character", "Setting"] },
    ],
  },
  "Writing": {
    children: [
      { name: "Sentence Writing", concepts: ["Capital letter", "Punctuation", "Complete sentence"] },
      { name: "Paragraph Writing", concepts: ["Topic sentence", "Supporting detail", "Closing sentence"] },
    ],
  },
  "Basic Science": {
    children: [
      { name: "Living and Nonliving Things", concepts: ["Living thing", "Nonliving thing", "Needs", "Growth"] },
      { name: "Weather Basics", concepts: ["Sunny", "Rainy", "Windy", "Temperature"] },
    ],
  },
};

const completedObjectives = db.prepare(`
  SELECT
    o.title,
    t.name AS topicName
  FROM alai_learning_objectives o
  JOIN curriculum_topics t ON t.id = o.topic_id
  JOIN alai_expansion_gate gate ON gate.topic_id = t.id
  WHERE o.status = 'COMPLETED'
    AND gate.allowed = 1
  ORDER BY o.updated_at DESC
  LIMIT 20
`).all() as { title: string; topicName: string }[];

let topicsCreatedOrFound = 0;
let conceptsCreatedOrFound = 0;
let prerequisitesLinked = 0;

for (const objective of completedObjectives) {
  const rule = expansionRules[objective.topicName];
  if (!rule) continue;

  for (const child of rule.children) {
    const childTopicId = getOrCreateTopic(
      child.name,
      objective.topicName,
      `Automatically expanded from mastered topic "${objective.topicName}".`
    );

    if (!childTopicId) continue;

    topicsCreatedOrFound++;

    for (const conceptName of child.concepts) {
      const conceptId = getOrCreateConcept(
        conceptName,
        `Concept generated by curriculum expansion under "${child.name}".`
      );

      linkTopicConcept(childTopicId, conceptId);
      conceptsCreatedOrFound++;
    }

    linkPrerequisite(child.name, objective.topicName);
    prerequisitesLinked++;
  }
}

console.log("ALAI curriculum expansion engine completed.");
console.log({
  completedObjectives: completedObjectives.length,
  topicsCreatedOrFound,
  conceptsCreatedOrFound,
  prerequisitesLinked,
});

console.table(db.prepare(`
  SELECT
    child.name AS topic,
    parent.name AS parent,
    COUNT(tc.concept_id) AS concepts
  FROM curriculum_topics child
  JOIN curriculum_topics parent ON parent.id = child.parent_topic_id
  LEFT JOIN topic_concepts tc ON tc.topic_id = child.id
  WHERE parent.name IN (
    'Addition',
    'Subtraction',
    'Multiplication',
    'Division',
    'Reading',
    'Writing',
    'Basic Science'
  )
  GROUP BY child.id
  ORDER BY parent.name, child.name
`).all());

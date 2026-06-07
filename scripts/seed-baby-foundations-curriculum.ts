import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

function id() {
  return crypto.randomUUID();
}

function getOrCreateDomain(name: string, parentName?: string) {
  const existing = db.prepare(`SELECT id FROM academic_domains WHERE name = ? LIMIT 1`).get(name) as { id: string } | undefined;
  if (existing) return existing.id;

  let parentId: string | null = null;
  let depth = 0;

  if (parentName) {
    const parent = db.prepare(`SELECT id, depth FROM academic_domains WHERE name = ? LIMIT 1`).get(parentName) as { id: string; depth: number } | undefined;
    if (parent) {
      parentId = parent.id;
      depth = parent.depth + 1;
    }
  }

  const newId = id();
  db.prepare(`
    INSERT INTO academic_domains (
      id, name, parent_domain_id, description, depth, status, confidence_score, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, 'PENDING', 0.35, ?, ?)
  `).run(
    newId,
    name,
    parentId,
    "Foundational domain for ALAI's earliest learning stage.",
    depth,
    now,
    now
  );

  return newId;
}

function getOrCreateTopic(input: {
  name: string;
  domainId: string;
  parentTopicId?: string | null;
  description: string;
}) {
  const existing = db.prepare(`
    SELECT id FROM curriculum_topics
    WHERE name = ?
      AND COALESCE(domain_id, '') = COALESCE(?, '')
    LIMIT 1
  `).get(input.name, input.domainId) as { id: string } | undefined;

  if (existing) return existing.id;

  let depth = 0;

  if (input.parentTopicId) {
    const parent = db.prepare(`SELECT depth FROM curriculum_topics WHERE id = ? LIMIT 1`).get(input.parentTopicId) as { depth: number } | undefined;
    depth = parent ? parent.depth + 1 : 0;
  }

  const newId = id();

  db.prepare(`
    INSERT INTO curriculum_topics (
      id, education_level_id, domain_id, parent_topic_id,
      name, description, depth, status, confidence_score,
      expansion_status, created_at, updated_at
    )
    VALUES (?, NULL, ?, ?, ?, ?, ?, 'PENDING', 0.35, 'OPEN', ?, ?)
  `).run(
    newId,
    input.domainId,
    input.parentTopicId ?? null,
    input.name,
    input.description,
    depth,
    now,
    now
  );

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
    VALUES (?, ?, ?, 'PENDING', 0.35, 0.65, ?, ?)
  `).run(newId, name, description, now, now);

  return newId;
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
  const topic = db.prepare(`SELECT id FROM curriculum_topics WHERE name = ? LIMIT 1`).get(topicName) as { id: string } | undefined;
  const prerequisite = db.prepare(`SELECT id FROM curriculum_topics WHERE name = ? LIMIT 1`).get(prerequisiteName) as { id: string } | undefined;

  if (!topic || !prerequisite) return;

  db.prepare(`
    INSERT OR IGNORE INTO topic_prerequisites (
      topic_id, prerequisite_topic_id, confidence_score, created_at
    )
    VALUES (?, ?, 0.4, ?)
  `).run(topic.id, prerequisite.id, now);
}

const foundationalDomainId = getOrCreateDomain("Foundational Learning");

const babyFoundationsId = getOrCreateTopic({
  name: "Baby Foundations",
  domainId: foundationalDomainId,
  description: "The first curriculum ALAI must learn: basic world categories, perception, early language, and primitive reasoning.",
});

const topicDefinitions = [
  {
    name: "Objects",
    description: "Basic physical things that can be seen, touched, named, and grouped.",
    concepts: ["Object", "Toy", "Cup", "Ball", "Book"],
  },
  {
    name: "Colors",
    description: "Basic color categories used to describe objects.",
    concepts: ["Color", "Red", "Blue", "Green", "Yellow"],
  },
  {
    name: "Shapes",
    description: "Basic geometric forms recognized visually.",
    concepts: ["Shape", "Circle", "Square", "Triangle", "Rectangle"],
  },
  {
    name: "Numbers",
    description: "Basic number ideas before formal arithmetic.",
    concepts: ["Number", "One", "Two", "Three", "More", "Less"],
  },
  {
    name: "Counting",
    description: "Ordering numbers and matching numbers to quantities.",
    concepts: ["Counting", "Quantity", "First", "Next", "Last"],
  },
  {
    name: "Comparison",
    description: "Comparing simple properties of objects.",
    concepts: ["Same", "Different", "Big", "Small", "More", "Less"],
  },
  {
    name: "Patterns",
    description: "Recognizing repeated structures and simple sequences.",
    concepts: ["Pattern", "Repeat", "Sequence", "Before", "After"],
  },
  {
    name: "Animals",
    description: "Basic living things and common animal categories.",
    concepts: ["Animal", "Dog", "Cat", "Bird", "Fish"],
  },
  {
    name: "Food",
    description: "Common foods and basic eating-related categories.",
    concepts: ["Food", "Fruit", "Water", "Milk", "Bread"],
  },
  {
    name: "Family",
    description: "Basic social roles and family relationships.",
    concepts: ["Family", "Mother", "Father", "Child", "Friend"],
  },
  {
    name: "Body Parts",
    description: "Basic body parts and self-awareness vocabulary.",
    concepts: ["Body", "Hand", "Foot", "Eye", "Mouth"],
  },
  {
    name: "Emotions",
    description: "Basic feelings and social-emotional categories.",
    concepts: ["Emotion", "Happy", "Sad", "Angry", "Scared"],
  },
  {
    name: "Basic Actions",
    description: "Simple actions used to understand behavior and instructions.",
    concepts: ["Action", "Eat", "Walk", "Run", "Sleep", "Play"],
  },
  {
    name: "Letters",
    description: "Early symbolic language units.",
    concepts: ["Letter", "Alphabet", "Sound", "Name"],
  },
  {
    name: "Words",
    description: "Simple named units of meaning.",
    concepts: ["Word", "Meaning", "Name", "Speak"],
  },
  {
    name: "Simple Sentences",
    description: "Basic language structures for simple communication.",
    concepts: ["Sentence", "Subject", "Verb", "I am", "This is"],
  },
];

for (const topic of topicDefinitions) {
  const topicId = getOrCreateTopic({
    name: topic.name,
    domainId: foundationalDomainId,
    parentTopicId: babyFoundationsId,
    description: topic.description,
  });

  for (const conceptName of topic.concepts) {
    const conceptId = getOrCreateConcept(
      conceptName,
      `Foundational concept for Academic Baby curriculum: ${conceptName}.`
    );
    linkTopicConcept(topicId, conceptId);
  }
}

linkPrerequisite("Counting", "Numbers");
linkPrerequisite("Comparison", "Objects");
linkPrerequisite("Patterns", "Comparison");
linkPrerequisite("Words", "Letters");
linkPrerequisite("Simple Sentences", "Words");

console.log("Baby Foundations curriculum seeded.");

console.log({
  domain: "Foundational Learning",
  rootTopic: "Baby Foundations",
  subtopics: topicDefinitions.length,
  conceptsSeededOrLinked: topicDefinitions.reduce((sum, t) => sum + t.concepts.length, 0),
});

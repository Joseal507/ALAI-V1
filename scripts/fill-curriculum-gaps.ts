import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

function uuid() {
  return crypto.randomUUID();
}

type Topic = {
  id: string;
  name: string;
  domain_id: string;
  parent_topic_id: string | null;
  depth: number;
};

function getTopic(name: string): Topic | undefined {
  return db.prepare(`
    SELECT id, name, domain_id, parent_topic_id, depth
    FROM curriculum_topics
    WHERE lower(name) = lower(?)
    LIMIT 1
  `).get(name) as Topic | undefined;
}

function getOrCreateConcept(name: string, description: string): string {
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
    VALUES (?, ?, ?, 'PENDING', 0.45, 0.55, ?, ?)
  `).run(id, name, description, now, now);

  return id;
}

function linkConcept(topicName: string, conceptName: string) {
  const topic = getTopic(topicName);
  if (!topic) return false;

  const conceptId = getOrCreateConcept(
    conceptName,
    `Core concept for curriculum topic "${topicName}".`
  );

  db.prepare(`
    INSERT OR IGNORE INTO topic_concepts (
      topic_id, concept_id, confidence_score, created_at
    )
    VALUES (?, ?, 0.55, ?)
  `).run(topic.id, conceptId, now);

  return true;
}

function linkPrerequisite(topicName: string, prerequisiteName: string) {
  const topic = getTopic(topicName);
  const prerequisite = getTopic(prerequisiteName);

  if (!topic || !prerequisite) return false;
  if (topic.id === prerequisite.id) return false;

  db.prepare(`
    INSERT OR IGNORE INTO topic_prerequisites (
      topic_id, prerequisite_topic_id, confidence_score, created_at
    )
    VALUES (?, ?, 0.55, ?)
  `).run(topic.id, prerequisite.id, now);

  return true;
}

const topicConceptRules: Record<string, string[]> = {
  "Vector Spaces": ["Vector", "Scalar", "Basis", "Span", "Linear Combination", "Linear Independence"],
  "Group Theory": ["Group", "Operation", "Identity Element", "Inverse Element", "Associativity", "Subgroup"],
  "Primary Foundations": ["Counting", "Colors", "Shapes", "Body Parts", "Family", "Animals"],
  "Primary Education": ["Reading", "Writing", "Basic Arithmetic", "Basic Science", "Social Skills"],
};

const prerequisiteRules: Record<string, string[]> = {
  "Objects": ["Baby Foundations"],
  "Mental Addition Strategies": ["Addition Facts"],
  "Coordinate Geometry": ["Graphing Linear Equations"],
  "Elementary Algebra": ["Basic Arithmetic"],
  "Reading": ["Letters", "Words"],
  "Animals": ["Baby Foundations"],
  "Basic History": ["Story Understanding"],
  "Grammar Basics": ["Simple Sentences"],
  "Vector Spaces": ["Linear Algebra"],
  "Group Theory": ["Abstract Algebra"],
  "Primary Foundations": ["Baby Foundations"],
  "Primary Education": ["Primary Foundations"],
  "Baby Foundations": ["Primary Foundations"],
  "Story Understanding": ["Reading"],
  "Mental Subtraction Strategies": ["Subtraction Facts"],
  "One-Step Addition Problems": ["Addition Word Problems"],
  "Organized Writing": ["Paragraph Writing"],
  "Decoding Words": ["Phonics"],
  "Letters": ["Reading"],
  "Basic Science": ["Primary Foundations"],
  "Food": ["Objects"],
  "Basic Arithmetic": ["Numbers", "Counting"],
  "Health and Safety": ["Body Parts"],
  "Social Skills": ["Emotions", "Family"],
  "Basic Geography": ["Objects"],
  "Emotions": ["Baby Foundations"],
  "Algebraic Manipulation": ["Elementary Algebra"],
  "Basic Actions": ["Baby Foundations"],
  "Linear Equations": ["Elementary Algebra"],
  "Shapes": ["Objects"],
  "Colors": ["Objects"],
  "Family": ["Social Skills"],
  "Body Parts": ["Baby Foundations"],
  "Numbers": ["Counting"],
};

let conceptsLinked = 0;
let prerequisitesLinked = 0;

for (const [topicName, concepts] of Object.entries(topicConceptRules)) {
  for (const conceptName of concepts) {
    if (linkConcept(topicName, conceptName)) conceptsLinked++;
  }
}

for (const [topicName, prerequisites] of Object.entries(prerequisiteRules)) {
  for (const prerequisiteName of prerequisites) {
    if (linkPrerequisite(topicName, prerequisiteName)) prerequisitesLinked++;
  }
}

console.log("Curriculum gaps filled.");
console.log({ conceptsLinked, prerequisitesLinked });

console.table(db.prepare(`
  SELECT
    t.name,
    COUNT(DISTINCT tc.concept_id) AS concepts,
    COUNT(DISTINCT tp.prerequisite_topic_id) AS prerequisites
  FROM curriculum_topics t
  LEFT JOIN topic_concepts tc ON tc.topic_id = t.id
  LEFT JOIN topic_prerequisites tp ON tp.topic_id = t.id
  GROUP BY t.id
  ORDER BY concepts ASC, prerequisites ASC, t.name ASC
  LIMIT 40
`).all());

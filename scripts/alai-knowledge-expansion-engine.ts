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

const expansionMap: Record<string, { child: string; concepts: string[] }[]> = {
  "Addition Facts": [
    { child: "Mental Addition Strategies", concepts: ["Make ten", "Count on", "Doubles strategy", "Number bonds"] },
  ],
  "Addition Word Problems": [
    { child: "One-Step Addition Problems", concepts: ["Word problem", "Unknown total", "Addition equation"] },
  ],
  "Subtraction Facts": [
    { child: "Mental Subtraction Strategies", concepts: ["Count back", "Use addition to subtract", "Fact family"] },
  ],
  "Reading Comprehension": [
    { child: "Story Understanding", concepts: ["Plot", "Character motivation", "Beginning middle end"] },
  ],
  "Phonics": [
    { child: "Decoding Words", concepts: ["Sound blending", "Consonant", "Vowel", "Digraph"] },
  ],
  "Sentence Writing": [
    { child: "Grammar Basics", concepts: ["Noun", "Verb", "Adjective", "Punctuation"] },
  ],
  "Paragraph Writing": [
    { child: "Organized Writing", concepts: ["Main idea", "Supporting sentence", "Paragraph structure"] },
  ],
};

const candidates = db.prepare(`
  SELECT t.name
  FROM topic_coverage_rollup tr
  JOIN curriculum_topics t ON t.id = tr.topic_id
  JOIN alai_expansion_gate gate ON gate.topic_id = t.id
  WHERE tr.rollup_coverage_score >= 0.2
    AND gate.allowed = 1
  ORDER BY tr.rollup_coverage_score DESC
  LIMIT 30
`).all() as { name: string }[];

let createdTopics = 0;
let linkedConcepts = 0;

for (const candidate of candidates) {
  const rules = expansionMap[candidate.name];
  if (!rules) continue;

  for (const rule of rules) {
    const topicId = getOrCreateTopic(
      rule.child,
      candidate.name,
      `Knowledge expansion generated from "${candidate.name}".`
    );

    if (!topicId) continue;

    createdTopics++;

    for (const conceptName of rule.concepts) {
      const conceptId = getOrCreateConcept(
        conceptName,
        `Generated concept for expanded topic "${rule.child}".`
      );
      linkTopicConcept(topicId, conceptId);
      linkedConcepts++;
    }
  }
}

console.log("ALAI knowledge expansion engine completed.");
console.log({ candidateTopics: candidates.length, createdTopics, linkedConcepts });

console.table(db.prepare(`
  SELECT child.name AS topic, parent.name AS parent, COUNT(tc.concept_id) AS concepts
  FROM curriculum_topics child
  JOIN curriculum_topics parent ON parent.id = child.parent_topic_id
  LEFT JOIN topic_concepts tc ON tc.topic_id = child.id
  WHERE child.created_at >= ?
  GROUP BY child.id
  ORDER BY child.created_at DESC
  LIMIT 20
`).all(now));

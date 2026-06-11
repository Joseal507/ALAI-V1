import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

type ConceptRow = { id: string; name: string };

const concepts = db.prepare(`
  SELECT id, name
  FROM concepts
`).all() as ConceptRow[];

const conceptByName = new Map(
  concepts.map((c) => [c.name.trim().toLowerCase(), c])
);

function findConcept(name: string) {
  return conceptByName.get(name.trim().toLowerCase()) ?? null;
}

function relationExists(fromId: string, toId: string, type: string) {
  const row = db.prepare(`
    SELECT id
    FROM relations
    WHERE from_concept_id = ?
      AND to_concept_id = ?
      AND relation_type = ?
    LIMIT 1
  `).get(fromId, toId, type) as { id: string } | undefined;

  return Boolean(row);
}

function insertRelation(
  fromName: string,
  toName: string,
  type: string,
  description: string,
  confidence = 0.55
) {
  const from = findConcept(fromName);
  const to = findConcept(toName);

  if (!from || !to || from.id === to.id) return false;
  if (relationExists(from.id, to.id, type)) return false;

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
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    from.id,
    to.id,
    type,
    description,
    confidence,
    now,
    now
  );

  return true;
}

let inserted = 0;
let skipped = 0;

function add(
  from: string,
  to: string,
  type: string,
  description: string,
  confidence = 0.55
) {
  if (insertRelation(from, to, type, description, confidence)) inserted++;
  else skipped++;
}

// Core preschool / primary relations.
const rules: [string, string, string, string, number][] = [
  ["Addition", "Number", "DEPENDS_ON", "Addition depends on understanding numbers.", 0.8],
  ["Addition", "Counting", "DEPENDS_ON", "Addition builds on counting.", 0.8],
  ["Subtraction", "Addition", "INVERSE_OF", "Subtraction is the inverse operation of addition.", 0.85],
  ["Multiplication", "Addition", "EXTENDS", "Multiplication extends repeated addition.", 0.85],
  ["Division", "Multiplication", "INVERSE_OF", "Division is the inverse operation of multiplication.", 0.85],
  ["Division", "Equal Sharing", "EXPLAINS", "Division can be explained as equal sharing.", 0.8],
  ["Equal Sharing", "Group", "OPERATES_ON", "Equal sharing operates on groups.", 0.7],
  ["Number", "Digit", "DEPENDS_ON", "Digits are symbols used to write numbers.", 0.8],
  ["Counting", "Number", "USED_FOR", "Counting is used to determine number quantity.", 0.8],
  ["Comparison", "Number", "OPERATES_ON", "Comparison can operate on numbers.", 0.7],
  ["Comparison", "Big", "DEPENDS_ON", "Big is a comparison idea.", 0.7],
  ["Comparison", "Small", "DEPENDS_ON", "Small is a comparison idea.", 0.7],
  ["Color", "Blue", "EXAMPLE_OF", "Blue is an example of a color.", 0.8],
  ["Animal", "Cat", "EXAMPLE_OF", "Cat is an example of an animal.", 0.8],
  ["Animal", "Bird", "EXAMPLE_OF", "Bird is an example of an animal.", 0.8],
  ["Body", "Body Parts", "PART_OF", "Body parts are parts of the body.", 0.75],
  ["Sentence", "Word", "DEPENDS_ON", "Sentences are built from words.", 0.8],
  ["Word", "Letter", "DEPENDS_ON", "Words are built from letters.", 0.8],
  ["Reading", "Phonics", "DEPENDS_ON", "Reading depends partly on phonics.", 0.8],
  ["Writing", "Sentence Writing", "PART_OF", "Sentence writing is part of writing.", 0.75],
];

for (const rule of rules) {
  add(...rule);
}

// Curriculum topic concept co-occurrence relations.
const topicConcepts = db.prepare(`
  SELECT
    t.name AS topicName,
    c.name AS conceptName
  FROM topic_concepts tc
  JOIN curriculum_topics t ON t.id = tc.topic_id
  JOIN concepts c ON c.id = tc.concept_id
  ORDER BY t.name, c.name
`).all() as { topicName: string; conceptName: string }[];

const byTopic = new Map<string, string[]>();

for (const row of topicConcepts) {
  const arr = byTopic.get(row.topicName) ?? [];
  arr.push(row.conceptName);
  byTopic.set(row.topicName, arr);
}

for (const [topic, names] of byTopic.entries()) {
  const unique = [...new Set(names)].slice(0, 8);

  for (let i = 0; i < unique.length; i++) {
    for (let j = i + 1; j < unique.length; j++) {
      const a = unique[i];
      const b = unique[j];

      add(
        a,
        b,
        "DEPENDS_ON",
        `${a} and ${b} are connected inside the curriculum topic "${topic}".`,
        0.45
      );

      add(
        b,
        a,
        "DEPENDS_ON",
        `${b} and ${a} are connected inside the curriculum topic "${topic}".`,
        0.45
      );
    }
  }
}

// Topic prerequisite relations between mapped concepts.
const prerequisiteRows = db.prepare(`
  SELECT
    t.name AS topicName,
    p.name AS prerequisiteName,
    c1.name AS topicConcept,
    c2.name AS prerequisiteConcept
  FROM topic_prerequisites tp
  JOIN curriculum_topics t ON t.id = tp.topic_id
  JOIN curriculum_topics p ON p.id = tp.prerequisite_topic_id
  JOIN topic_concepts tc1 ON tc1.topic_id = t.id
  JOIN concepts c1 ON c1.id = tc1.concept_id
  JOIN topic_concepts tc2 ON tc2.topic_id = p.id
  JOIN concepts c2 ON c2.id = tc2.concept_id
  LIMIT 500
`).all() as {
  topicName: string;
  prerequisiteName: string;
  topicConcept: string;
  prerequisiteConcept: string;
}[];

for (const row of prerequisiteRows) {
  add(
    row.topicConcept,
    row.prerequisiteConcept,
    "DEPENDS_ON",
    `${row.topicConcept} depends on prerequisite concept ${row.prerequisiteConcept} through topic "${row.topicName}".`,
    0.5
  );
}

console.log("ALAI core relation expansion completed.");
console.log({ inserted, skipped });

console.table(db.prepare(`
  SELECT relation_type AS type, COUNT(*) AS count
  FROM relations
  GROUP BY relation_type
  ORDER BY count DESC
`).all());

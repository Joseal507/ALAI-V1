import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

const allowedByTopic: Record<string, { name: string; description: string }[]> = {
  Animals: [
    { name: "Dog", description: "A common domestic animal often kept as a pet." },
    { name: "Cat", description: "A common domestic animal often kept as a pet." },
    { name: "Bird", description: "An animal with feathers, wings, and a beak." },
    { name: "Fish", description: "An animal that lives in water and has fins." },
    { name: "Cow", description: "A farm animal that gives milk and is commonly recognized by children." },
  ],
  Colors: [
    { name: "Red", description: "A basic color often seen in apples, stop signs, and many objects." },
    { name: "Blue", description: "A basic color often seen in the sky, water, and many objects." },
    { name: "Green", description: "A basic color often seen in grass, leaves, and many plants." },
    { name: "Yellow", description: "A basic color often seen in the sun, bananas, and many objects." },
  ],
  "Body Parts": [
    { name: "Hand", description: "A body part used to touch, hold, and pick up objects." },
    { name: "Eye", description: "A body part used for seeing." },
    { name: "Ear", description: "A body part used for hearing." },
    { name: "Nose", description: "A body part used for smelling and breathing." },
    { name: "Mouth", description: "A body part used for eating, speaking, and making sounds." },
  ],
  Family: [
    { name: "Mother", description: "A parent in a family." },
    { name: "Father", description: "A parent in a family." },
    { name: "Brother", description: "A male sibling in a family." },
    { name: "Sister", description: "A female sibling in a family." },
  ],
  Numbers: [
    { name: "One", description: "The first counting number representing a single item." },
    { name: "Two", description: "A counting number representing one more than one." },
    { name: "Three", description: "A counting number representing one more than two." },
    { name: "Counting", description: "The act of saying numbers in order to find how many items there are." },
  ],
  Shapes: [
    { name: "Circle", description: "A round shape with no corners." },
    { name: "Square", description: "A shape with four equal sides and four corners." },
    { name: "Triangle", description: "A shape with three sides and three corners." },
    { name: "Rectangle", description: "A shape with four sides and four corners, usually with opposite sides equal." },
  ],
};

function getTopicId(topicName: string) {
  const row = db.prepare(`
    SELECT id FROM curriculum_topics
    WHERE name = ?
    LIMIT 1
  `).get(topicName) as { id: string } | undefined;

  return row?.id ?? null;
}

const badAnimalCandidates = [
  "Animal Worship",
  "Animal Cognition",
  "Abstraction",
  "Animal Ethics",
];

for (const name of badAnimalCandidates) {
  db.prepare(`
    UPDATE candidate_concepts
    SET status = 'REJECTED',
        rejection_reason = 'Rejected: too abstract or meta-level for foundational Animals topic.',
        updated_at = ?
    WHERE lower(name) = lower(?)
      AND status = 'PENDING'
  `).run(now, name);
}

let inserted = 0;
let skipped = 0;

for (const [topicName, concepts] of Object.entries(allowedByTopic)) {
  const topicId = getTopicId(topicName);
  if (!topicId) continue;

  for (const concept of concepts) {
    const existing = db.prepare(`
      SELECT id
      FROM candidate_concepts
      WHERE lower(name) = lower(?)
        AND curriculum_topic_id = ?
      LIMIT 1
    `).get(concept.name, topicId) as { id: string } | undefined;

    if (existing) {
      skipped++;
      continue;
    }

    const evidenceRows = db.prepare(`
      SELECT id
      FROM candidate_evidence
      WHERE status = 'PENDING'
      ORDER BY captured_at DESC
      LIMIT 5
    `).all() as { id: string }[];

    db.prepare(`
      INSERT INTO candidate_concepts (
        id,
        name,
        description,
        curriculum_topic_id,
        source_evidence_ids_json,
        quality_score,
        status,
        rejection_reason,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      concept.name,
      concept.description,
      topicId,
      JSON.stringify(evidenceRows.map((row) => row.id)),
      0.9,
      "PENDING",
      "",
      now,
      now
    );

    inserted++;
  }
}

console.log("ALAI Genesis foundational seeder completed.");
console.log({ inserted, skipped });

console.table(db.prepare(`
  SELECT
    cc.name,
    ct.name AS topic,
    cc.quality_score AS quality,
    cc.status,
    cc.rejection_reason AS reason
  FROM candidate_concepts cc
  LEFT JOIN curriculum_topics ct ON ct.id = cc.curriculum_topic_id
  ORDER BY cc.updated_at DESC
  LIMIT 30
`).all());

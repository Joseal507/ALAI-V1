import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

const coreConcepts = [
  ["Vector Space", "A mathematical structure containing vectors that can be added together and multiplied by scalars."],
  ["Basis", "A set of linearly independent vectors that can generate every vector in a vector space."],
  ["Dimension", "The number of vectors in a basis of a vector space."],
  ["Linear Independence", "A property of vectors where none can be written as a linear combination of the others."],
  ["Span", "The set of all linear combinations that can be formed from a group of vectors."],
  ["Writing", "The skill of representing language using symbols, letters, or words."],
  ["Numbers", "Symbols or ideas used to count, measure, and compare quantities."],
  ["Geometry", "A branch of mathematics about shapes, space, angles, and measurement."],
  ["Angle Measurement", "The process of measuring the size of an angle."],
  ["Complementary Angle", "An angle that combines with another angle to make ninety degrees."],
];

function getConceptId(name: string): string | null {
  const row = db.prepare(`
    SELECT id FROM concepts
    WHERE lower(name) = lower(?)
    LIMIT 1
  `).get(name) as { id: string } | undefined;

  return row?.id || null;
}

function ensureConcept(name: string, description: string): string {
  const existing = getConceptId(name);
  if (existing) return existing;

  const id = crypto.randomUUID();

  db.prepare(`
    INSERT INTO concepts (
      id,
      name,
      description,
      status,
      confidence_score,
      uncertainty_score,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, 'PENDING', 0.56, 0.44, ?, ?)
  `).run(id, name, description, now, now);

  return id;
}

for (const [name, description] of coreConcepts) {
  ensureConcept(name, description);
}

const prereqs = [
  ["Vector Space", "Vector"],
  ["Vector Space", "Scalar"],
  ["Linear Combination", "Vector"],
  ["Linear Combination", "Scalar"],
  ["Basis", "Vector Space"],
  ["Basis", "Linear Independence"],
  ["Dimension", "Vector Space"],
  ["Linear Independence", "Vector Space"],
  ["Span", "Linear Combination"],
  ["Span", "Vector Space"],
  ["Group Theory", "Group"],
  ["Subgroup", "Group"],
  ["Identity Element", "Group"],
  ["Inverse Element", "Group"],
  ["Primary Education", "Reading"],
  ["Primary Education", "Writing"],
  ["Primary Education", "Basic Arithmetic"],
  ["Reading", "Words"],
  ["Writing", "Words"],
  ["Basic Arithmetic", "Counting"],
  ["Basic Arithmetic", "Numbers"],
  ["Geometry", "Shape"],
  ["Angle Measurement", "Geometry"],
  ["Complementary Angle", "Angle Measurement"],
];

let prereqsInserted = 0;

for (const [concept, prereq] of prereqs) {
  const conceptId = getConceptId(concept);
  const prereqId = getConceptId(prereq);

  if (!conceptId || !prereqId) continue;

  const result = db.prepare(`
    INSERT OR IGNORE INTO concept_prerequisites (
      concept_id,
      prerequisite_concept_id,
      created_at
    )
    VALUES (?, ?, ?)
  `).run(conceptId, prereqId, now);

  prereqsInserted += result.changes;
}

const coreTargets = [
  "Vector",
  "Scalar",
  "Linear Combination",
  "Vector Space",
  "Basis",
  "Dimension",
  "Linear Independence",
  "Span",
  "Writing",
  "Reading",
  "Basic Arithmetic",
  "Geometry",
  "Angle Measurement",
  "Complementary Angle",
];

let questionsOpened = 0;
let questionsCreated = 0;

for (const name of coreTargets) {
  const conceptId = getConceptId(name);
  if (!conceptId) continue;

  db.prepare(`
    UPDATE concepts
    SET status = CASE WHEN status = 'REJECTED' THEN 'PENDING' ELSE status END,
        updated_at = ?
    WHERE id = ?
  `).run(now, conceptId);

  const reopened = db.prepare(`
    UPDATE alai_research_questions
    SET status = 'OPEN',
        priority_score = 0.99,
        updated_at = ?
    WHERE concept_id = ?
      AND status IN ('REJECTED','OPEN')
  `).run(now, conceptId);

  questionsOpened += reopened.changes;

  const types = [
    ["EVIDENCE_GAP", `What reliable evidence is needed to strengthen ${name}?`, 0.99],
    ["RELATION_GAP", `Which prerequisite, dependency, application, or related concepts should ${name} have?`, 0.98],
    ["MASTERY_GAP", `What is missing for ${name} to become strong and reliable?`, 0.97],
  ] as const;

  for (const [type, question, priority] of types) {
    const exists = db.prepare(`
      SELECT id
      FROM alai_research_questions
      WHERE concept_id = ?
        AND question_type = ?
        AND question = ?
      LIMIT 1
    `).get(conceptId, type, question);

    if (exists) continue;

    db.prepare(`
      INSERT INTO alai_research_questions (
        id,
        concept_id,
        topic_id,
        question,
        question_type,
        priority_score,
        status,
        created_at,
        updated_at
      )
      VALUES (?, ?, NULL, ?, ?, ?, 'OPEN', ?, ?)
    `).run(crypto.randomUUID(), conceptId, question, type, priority, now, now);

    questionsCreated++;
  }
}

db.prepare(`
  UPDATE alai_research_questions
  SET priority_score = 0.15,
      updated_at = ?
  WHERE status = 'OPEN'
    AND concept_id NOT IN (
      SELECT id FROM concepts
      WHERE lower(name) IN (${coreTargets.map(() => "?").join(",")})
    )
`).run(now, ...coreTargets.map((name) => name.toLowerCase()));

console.log("Night learning preparation completed.");
console.log({
  prereqsInserted,
  questionsOpened,
  questionsCreated,
});

console.log("\nPrerequisites:");
console.table(db.prepare(`
SELECT c.name AS concept, p.name AS prerequisite
FROM concept_prerequisites cp
JOIN concepts c ON c.id = cp.concept_id
JOIN concepts p ON p.id = cp.prerequisite_concept_id
ORDER BY c.name, p.name
`).all());

console.log("\nTop open questions:");
console.table(db.prepare(`
SELECT c.name AS concept, q.question_type, q.priority_score, q.status
FROM alai_research_questions q
LEFT JOIN concepts c ON c.id = q.concept_id
WHERE q.status = 'OPEN'
ORDER BY q.priority_score DESC, q.created_at ASC
LIMIT 30
`).all());

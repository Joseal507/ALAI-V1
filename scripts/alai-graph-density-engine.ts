import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

function getConceptId(name: string): string | null {
  const row = db.prepare(`
    SELECT id
    FROM concepts
    WHERE lower(name) = lower(?)
    LIMIT 1
  `).get(name) as { id: string } | undefined;

  return row?.id ?? null;
}

function relationExists(fromId: string, toId: string, type: string): boolean {
  const row = db.prepare(`
    SELECT id
    FROM relations
    WHERE from_concept_id = ?
      AND to_concept_id = ?
      AND relation_type = ?
    LIMIT 1
  `).get(fromId, toId, type);

  return Boolean(row);
}

function addRelation(
  fromId: string,
  toId: string,
  type: string,
  description: string,
  confidence = 0.58
): boolean {
  if (fromId === toId) return false;
  if (relationExists(fromId, toId, type)) return false;

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
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    fromId,
    toId,
    type,
    description,
    confidence,
    now,
    now
  );

  return true;
}

function addByName(
  from: string,
  to: string,
  type: string,
  description: string,
  confidence = 0.65
): boolean {
  const fromId = getConceptId(from);
  const toId = getConceptId(to);

  if (!fromId || !toId) return false;

  return addRelation(fromId, toId, type, description, confidence);
}

let created = 0;
let skipped = 0;

const semanticRules = [
  ["Complex number", "Real number", "EXTENDS", "Complex numbers extend real numbers by adding an imaginary component."],
  ["Real Vector Space", "Vector Spaces", "IS_A", "A real vector space is a vector space over the real numbers."],
  ["Scalar Multiplication", "Vector Spaces", "PART_OF", "Scalar multiplication is one of the defining operations of a vector space."],
  ["Vector Axioms", "Vector Spaces", "DEFINES", "Vector axioms define the structure required for a vector space."],
  ["Span", "Linear Combination", "DEPENDS_ON", "Span depends on forming linear combinations of vectors."],
  ["Linear Independence", "Vector Spaces", "DEPENDS_ON", "Linear independence is a core concept in vector spaces."],
  ["Basis", "Linear Independence", "DEPENDS_ON", "A basis depends on linear independence."],
  ["Basis", "Span", "DEPENDS_ON", "A basis must span the vector space."],
  ["Linear Transformation", "Vector Spaces", "MAPS_BETWEEN", "Linear transformations map between vector spaces while preserving structure."],
  ["Euclidean Space", "Real Vector Space", "IS_A", "Euclidean space can be modeled as a real vector space."],
  ["Euclidean Vector", "Euclidean Space", "PART_OF", "Euclidean vectors are used in Euclidean space."],
  ["Triangle", "Geometry", "PART_OF", "Triangles are studied in geometry."],
  ["Circle", "Geometry", "PART_OF", "Circles are studied in geometry."],
  ["Square", "Geometry", "PART_OF", "Squares are studied in geometry."],
  ["Rectangle", "Geometry", "PART_OF", "Rectangles are studied in geometry."],
  ["Angle Measurement", "Geometry", "PART_OF", "Angle measurement is a geometric concept."],
  ["Basic Arithmetic", "Mathematics", "PART_OF", "Basic arithmetic is part of mathematics."],
  ["Numbers", "Basic Arithmetic", "FOUNDATION_FOR", "Numbers provide the foundation for basic arithmetic."],
  ["Arithmetic", "Basic Arithmetic", "DEPENDS_ON", "Arithmetic is closely related to basic arithmetic."],
  ["Addition", "Basic Arithmetic", "PART_OF", "Addition is part of basic arithmetic."],
  ["Subtraction", "Basic Arithmetic", "PART_OF", "Subtraction is part of basic arithmetic."],
  ["Multiplication", "Basic Arithmetic", "PART_OF", "Multiplication is part of basic arithmetic."],
  ["Division", "Basic Arithmetic", "PART_OF", "Division is part of basic arithmetic."],
  ["Basic Science", "Natural Sciences", "FOUNDATION_FOR", "Basic science provides foundations for natural sciences."],
  ["Body Parts", "Body", "PART_OF", "Body parts are parts of the body."],
  ["Hand", "Body Parts", "IS_A", "A hand is a body part."],
  ["Eye", "Body Parts", "IS_A", "An eye is a body part."],
  ["Nose", "Body Parts", "IS_A", "A nose is a body part."],
  ["Mouth", "Body Parts", "IS_A", "A mouth is a body part."],
  ["Cat", "Animal", "IS_A", "A cat is an animal."],
  ["Dog", "Animal", "IS_A", "A dog is an animal."],
  ["Bird", "Animal", "IS_A", "A bird is an animal."],
  ["Fish", "Animal", "IS_A", "A fish is an animal."],
  ["Cow", "Animal", "IS_A", "A cow is an animal."],
  ["Red", "Color", "IS_A", "Red is a color."],
  ["Blue", "Color", "IS_A", "Blue is a color."],
  ["Green", "Color", "IS_A", "Green is a color."],
  ["Yellow", "Color", "IS_A", "Yellow is a color."],
  ["Mother", "Family", "PART_OF", "Mother is a family role."],
  ["Father", "Family", "PART_OF", "Father is a family role."],
  ["Brother", "Family", "PART_OF", "Brother is a family role."],
  ["Sister", "Family", "PART_OF", "Sister is a family role."],
];

for (const [from, to, type, description] of semanticRules) {
  if (addByName(from, to, type, description, 0.72)) created++;
  else skipped++;
}

const weakButEvidenced = db.prepare(`
  SELECT
    c.id,
    c.name,
    COUNT(DISTINCT cel.evidence_id) AS evidence,
    COUNT(DISTINCT r.id) AS relations
  FROM concepts c
  JOIN concept_evidence_links cel ON cel.concept_id = c.id
  LEFT JOIN relations r
    ON r.from_concept_id = c.id
    OR r.to_concept_id = c.id
  WHERE c.status = 'PENDING'
  GROUP BY c.id
  HAVING evidence >= 3
     AND relations < 3
  ORDER BY evidence DESC
  LIMIT 80
`).all() as {
  id: string;
  name: string;
  evidence: number;
  relations: number;
}[];

for (const concept of weakButEvidenced) {
  const topicNeighbors = db.prepare(`
    SELECT DISTINCT other.id, other.name
    FROM topic_concepts tc
    JOIN topic_concepts otc ON otc.topic_id = tc.topic_id
    JOIN concepts other ON other.id = otc.concept_id
    WHERE tc.concept_id = ?
      AND other.id != ?
      AND other.status IN ('VERIFIED', 'CANONICAL')
    LIMIT 4
  `).all(concept.id, concept.id) as { id: string; name: string }[];

  for (const other of topicNeighbors) {
    if (addRelation(
      concept.id,
      other.id,
      "DEPENDS_ON",
      `${concept.name} depends on or is supported by ${other.name} through shared curriculum topics.`,
      0.62
    )) created++;
    else skipped++;
  }

  const evidenceNeighbors = db.prepare(`
    SELECT DISTINCT other.id, other.name
    FROM concept_evidence_links cel
    JOIN concept_evidence_links oel ON oel.evidence_id = cel.evidence_id
    JOIN concepts other ON other.id = oel.concept_id
    WHERE cel.concept_id = ?
      AND other.id != ?
      AND other.status IN ('VERIFIED', 'CANONICAL')
    LIMIT 4
  `).all(concept.id, concept.id) as { id: string; name: string }[];

  for (const other of evidenceNeighbors) {
    if (addRelation(
      concept.id,
      other.id,
      "SUPPORTS",
      `${concept.name} is supported by evidence also connected to ${other.name}.`,
      0.60
    )) created++;
    else skipped++;
  }
}

db.prepare(`
  DELETE FROM relations
  WHERE from_concept_id = to_concept_id
`).run();

console.log("ALAI graph density engine completed.");
console.log({
  created,
  skipped,
  weakButEvidenced: weakButEvidenced.length,
});

console.table(db.prepare(`
  SELECT
    c.name,
    c.status,
    COUNT(DISTINCT r.id) AS relations,
    COUNT(DISTINCT cel.evidence_id) AS evidence
  FROM concepts c
  LEFT JOIN relations r
    ON r.from_concept_id = c.id
    OR r.to_concept_id = c.id
  LEFT JOIN concept_evidence_links cel ON cel.concept_id = c.id
  GROUP BY c.id
  ORDER BY relations ASC, evidence DESC
  LIMIT 40
`).all());

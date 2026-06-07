import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

function conceptId(name: string) {
  const row = db.prepare(`
    SELECT id
    FROM concepts
    WHERE lower(name) = lower(?)
    LIMIT 1
  `).get(name) as { id: string } | undefined;

  return row?.id ?? null;
}

function addRelation(
  fromName: string,
  toName: string,
  relationType: string,
  description: string,
  confidence = 0.75
) {
  const fromId = conceptId(fromName);
  const toId = conceptId(toName);

  if (!fromId || !toId || fromId === toId) return false;

  const existing = db.prepare(`
    SELECT id
    FROM relations
    WHERE from_concept_id = ?
      AND to_concept_id = ?
      AND relation_type = ?
    LIMIT 1
  `).get(fromId, toId, relationType) as { id: string } | undefined;

  if (existing) return false;

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
    fromId,
    toId,
    relationType,
    description,
    confidence,
    now,
    now
  );

  return true;
}

const rules: [string, string, string, string, number?][] = [
  ["Dog", "Animal", "IS_A", "A dog is a kind of animal.", 0.9],
  ["Cat", "Animal", "IS_A", "A cat is a kind of animal.", 0.9],
  ["Bird", "Animal", "IS_A", "A bird is a kind of animal.", 0.9],
  ["Fish", "Animal", "IS_A", "A fish is a kind of animal.", 0.9],
  ["Cow", "Animal", "IS_A", "A cow is a kind of animal.", 0.9],

  ["Hand", "Body", "PART_OF", "A hand is part of the body.", 0.85],
  ["Eye", "Body", "PART_OF", "An eye is part of the body.", 0.85],
  ["Ear", "Body", "PART_OF", "An ear is part of the body.", 0.85],
  ["Nose", "Body", "PART_OF", "A nose is part of the body.", 0.85],
  ["Mouth", "Body", "PART_OF", "A mouth is part of the body.", 0.85],

  ["Mother", "Family", "PART_OF", "A mother is part of a family relationship.", 0.85],
  ["Father", "Family", "PART_OF", "A father is part of a family relationship.", 0.85],
  ["Brother", "Family", "PART_OF", "A brother is part of a family relationship.", 0.85],
  ["Sister", "Family", "PART_OF", "A sister is part of a family relationship.", 0.85],

  ["Red", "Color", "IS_A", "Red is a color.", 0.9],
  ["Blue", "Color", "IS_A", "Blue is a color.", 0.9],
  ["Green", "Color", "IS_A", "Green is a color.", 0.9],
  ["Yellow", "Color", "IS_A", "Yellow is a color.", 0.9],

  ["Circle", "Shape", "IS_A", "A circle is a shape.", 0.9],
  ["Square", "Shape", "IS_A", "A square is a shape.", 0.9],
  ["Triangle", "Shape", "IS_A", "A triangle is a shape.", 0.9],
  ["Rectangle", "Shape", "IS_A", "A rectangle is a shape.", 0.9],

  ["Two", "One", "DEPENDS_ON", "Understanding two depends on understanding one.", 0.8],
  ["Three", "Two", "DEPENDS_ON", "Understanding three depends on understanding two.", 0.8],
  ["Counting", "One", "DEPENDS_ON", "Counting begins with understanding one.", 0.8],
  ["Counting", "Two", "DEPENDS_ON", "Counting uses ordered numbers such as two.", 0.75],
  ["Counting", "Three", "DEPENDS_ON", "Counting uses ordered numbers such as three.", 0.75],
];

const categoryConcepts = [
  { name: "Animal", description: "A living thing that can move, eat, and respond to its environment." },
  { name: "Body", description: "The physical structure of a living being." },
  { name: "Family", description: "A group of related people or caregivers." },
  { name: "Color", description: "A visual property used to describe how things look." },
  { name: "Shape", description: "The form or outline of an object." },
];

let categoriesInserted = 0;

for (const category of categoryConcepts) {
  const existing = conceptId(category.name);
  if (existing) continue;

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
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    category.name,
    category.description,
    "PENDING",
    0.45,
    0.55,
    now,
    now
  );

  db.prepare(`
    INSERT INTO concept_mastery (
      id,
      concept_id,
      mastery_score,
      evidence_count,
      relation_count,
      contradiction_count,
      last_calculated_at,
      created_at,
      updated_at
    ) VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(concept_id) DO NOTHING
  `).run(id, 0.2, 0, 0, 0, now, now, now);

  categoriesInserted++;
}

let inserted = 0;
let skipped = 0;

for (const [from, to, type, description, confidence] of rules) {
  if (addRelation(from, to, type, description, confidence ?? 0.75)) inserted++;
  else skipped++;
}

const conceptsWithRelations = db.prepare(`
  SELECT DISTINCT c.id
  FROM concepts c
  JOIN relations r
    ON r.from_concept_id = c.id
    OR r.to_concept_id = c.id
`).all() as { id: string }[];

for (const c of conceptsWithRelations) {
  const stats = db.prepare(`
    SELECT
      (
        SELECT COUNT(*)
        FROM concept_evidence_links cel
        WHERE cel.concept_id = ?
      ) AS evidenceCount,
      (
        SELECT COUNT(*)
        FROM relations r
        WHERE r.from_concept_id = ?
           OR r.to_concept_id = ?
      ) AS relationCount
  `).get(c.id, c.id, c.id) as {
    evidenceCount: number;
    relationCount: number;
  };

  const mastery = Math.min(
    0.69,
    0.15 +
      Math.min(stats.evidenceCount / 5, 1) * 0.35 +
      Math.min(stats.relationCount / 3, 1) * 0.25
  );

  db.prepare(`
    INSERT INTO concept_mastery (
      id,
      concept_id,
      mastery_score,
      evidence_count,
      relation_count,
      contradiction_count,
      last_calculated_at,
      created_at,
      updated_at
    ) VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, 0, ?, ?, ?)
    ON CONFLICT(concept_id) DO UPDATE SET
      mastery_score = excluded.mastery_score,
      evidence_count = excluded.evidence_count,
      relation_count = excluded.relation_count,
      last_calculated_at = excluded.last_calculated_at,
      updated_at = excluded.updated_at
  `).run(
    c.id,
    Number(mastery.toFixed(3)),
    stats.evidenceCount,
    stats.relationCount,
    now,
    now,
    now
  );
}

console.log("ALAI Genesis relations completed.");
console.log({
  categoriesInserted,
  relationsInserted: inserted,
  relationsSkipped: skipped,
  conceptsWithRelations: conceptsWithRelations.length,
});

console.table(db.prepare(`
  SELECT
    fc.name AS fromConcept,
    r.relation_type AS relation,
    tc.name AS toConcept,
    r.confidence_score AS confidence
  FROM relations r
  JOIN concepts fc ON fc.id = r.from_concept_id
  JOIN concepts tc ON tc.id = r.to_concept_id
  ORDER BY fc.name ASC, r.relation_type ASC, tc.name ASC
  LIMIT 40
`).all());

console.table(db.prepare(`
  SELECT
    c.name,
    c.status,
    cm.mastery_score AS mastery,
    cm.evidence_count AS evidence,
    cm.relation_count AS relations
  FROM concept_mastery cm
  JOIN concepts c ON c.id = cm.concept_id
  ORDER BY cm.mastery_score DESC, c.name ASC
  LIMIT 30
`).all());

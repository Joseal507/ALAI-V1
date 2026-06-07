import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

const topicConcepts: Record<string, string[]> = {
  "Elementary Algebra": [
    "Variable",
    "Constant",
    "Expression",
    "Equation",
    "Coefficient",
    "Term",
    "Like terms",
    "Evaluate expression",
  ],
  "Linear Equations": [
    "Linear equation",
    "Solution",
    "Unknown",
    "Inverse operations",
    "Balance method",
    "One-step equation",
    "Two-step equation",
  ],
  "Algebraic Manipulation": [
    "Simplify expression",
    "Combine like terms",
    "Distributive property",
    "Expand expression",
    "Factor expression",
  ],
  "Coordinate Geometry": [
    "Coordinate plane",
    "X-axis",
    "Y-axis",
    "Ordered pair",
    "Origin",
    "Quadrant",
  ],
  "Graphing Linear Equations": [
    "Line graph",
    "Slope",
    "Y-intercept",
    "X-intercept",
    "Rate of change",
  ],
  "Slope-Intercept Form": [
    "Slope-intercept form",
    "Y equals mx plus b",
    "Slope coefficient",
    "Initial value",
  ],
  "Standard Form": [
    "Standard form equation",
    "Ax plus By equals C",
    "Linear standard form",
  ],
};

function getOrCreateConcept(name: string) {
  const existing = db.prepare(`
    SELECT id FROM concepts
    WHERE lower(name) = lower(?)
    LIMIT 1
  `).get(name) as { id: string } | undefined;

  if (existing) return existing.id;

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
    name,
    `${name} is a core concept needed for learning early algebra in a structured school curriculum.`,
    "PENDING",
    0.45,
    0.55,
    now,
    now
  );

  return id;
}

let conceptsCreated = 0;
let linksCreated = 0;
let skipped = 0;

for (const [topicName, conceptNames] of Object.entries(topicConcepts)) {
  const topic = db.prepare(`
    SELECT id FROM curriculum_topics
    WHERE name = ?
    LIMIT 1
  `).get(topicName) as { id: string } | undefined;

  if (!topic) {
    skipped += conceptNames.length;
    continue;
  }

  for (const conceptName of conceptNames) {
    const before = db.prepare(`
      SELECT id FROM concepts
      WHERE lower(name) = lower(?)
      LIMIT 1
    `).get(conceptName);

    const conceptId = getOrCreateConcept(conceptName);
    if (!before) conceptsCreated++;

    const existingLink = db.prepare(`
      SELECT 1 FROM topic_concepts
      WHERE topic_id = ?
        AND concept_id = ?
      LIMIT 1
    `).get(topic.id, conceptId);

    if (existingLink) {
      skipped++;
      continue;
    }

    db.prepare(`
      INSERT INTO topic_concepts (
        topic_id,
        concept_id,
        confidence_score,
        created_at
      ) VALUES (?, ?, ?, ?)
    `).run(topic.id, conceptId, 0.75, now);

    linksCreated++;
  }
}

console.log("ALAI algebra core concepts seeded.");
console.log({ conceptsCreated, linksCreated, skipped });

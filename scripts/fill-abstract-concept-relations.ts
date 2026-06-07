import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

function uuid() {
  return crypto.randomUUID();
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

function linkRelation(fromName: string, toName: string, relationType: string, description: string) {
  const fromId = getOrCreateConcept(fromName, `Concept used in relation expansion for "${fromName}".`);
  const toId = getOrCreateConcept(toName, `Concept used in relation expansion for "${toName}".`);

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
    )
    VALUES (?, ?, ?, ?, ?, 0.62, ?, ?)
  `).run(uuid(), fromId, toId, relationType, description, now, now);

  return true;
}

const relationRules = [
  {
    from: "Infant Development",
    to: "Early Childhood Education",
    type: "FOUNDATION_FOR",
    description: "Infant development provides developmental foundations for early childhood education.",
  },
  {
    from: "Infant Development",
    to: "Observational Learning",
    type: "RELATED_TO",
    description: "Infants and young children can learn through observing people and environments.",
  },
  {
    from: "Early Childhood Education",
    to: "Observational Learning",
    type: "USES",
    description: "Early childhood education can use observational learning through modeling and examples.",
  },
  {
    from: "Observational Learning",
    to: "Social Skills",
    type: "SUPPORTS",
    description: "Observational learning supports social skill development by modeling behaviors.",
  },
  {
    from: "Early Childhood Education",
    to: "Primary Education",
    type: "PREREQUISITE_FOR",
    description: "Early childhood education prepares learners for primary education.",
  },
];

let created = 0;
let skipped = 0;

for (const rule of relationRules) {
  if (linkRelation(rule.from, rule.to, rule.type, rule.description)) created++;
  else skipped++;
}

console.log("Abstract concept relation fill completed.");
console.log({ created, skipped });

console.table(db.prepare(`
  SELECT
    source.name AS fromConcept,
    relations.relation_type AS relationType,
    target.name AS toConcept,
    relations.confidence_score AS confidence
  FROM relations
  JOIN concepts source ON source.id = relations.from_concept_id
  JOIN concepts target ON target.id = relations.to_concept_id
  WHERE source.name IN (
    'Infant Development',
    'Early Childhood Education',
    'Observational Learning'
  )
  OR target.name IN (
    'Infant Development',
    'Early Childhood Education',
    'Observational Learning'
  )
  ORDER BY source.name, target.name
`).all());

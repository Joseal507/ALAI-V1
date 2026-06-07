import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

function conceptId(name: string): string | null {
  const row = db.prepare(`
    SELECT id FROM concepts
    WHERE lower(name)=lower(?)
    LIMIT 1
  `).get(name) as { id: string } | undefined;

  return row?.id ?? null;
}

function add(from: string, to: string, type: string, description: string) {
  const fromId = conceptId(from);
  const toId = conceptId(to);

  if (!fromId || !toId || fromId === toId) {
    console.log("Skipped missing:", from, "->", to);
    return false;
  }

  const exists = db.prepare(`
    SELECT id FROM relations
    WHERE from_concept_id = ?
      AND to_concept_id = ?
      AND relation_type = ?
    LIMIT 1
  `).get(fromId, toId, type);

  if (exists) return false;

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
    VALUES (?, ?, ?, ?, ?, 0.72, ?, ?)
  `).run(
    crypto.randomUUID(),
    fromId,
    toId,
    type,
    description,
    now,
    now
  );

  console.log("Added:", from, type, to);
  return true;
}

let created = 0;

const rules = [
  ["Complex number", "Real number", "RELATED_TO", "Complex numbers are related to real numbers because real numbers are contained in the complex number system."],
  ["Complex number", "Numbers", "IS_A", "A complex number is a type of number."],
  ["Complex number", "Mathematics", "PART_OF", "Complex numbers are studied in mathematics."],
  ["Complex number", "Algebra", "RELATED_TO", "Complex numbers are used in algebraic reasoning and equations."],
  ["Complex number", "Vector Spaces", "RELATED_TO", "Complex numbers can serve as scalars in complex vector spaces."],
];

for (const [from, to, type, description] of rules) {
  if (add(from, to, type, description)) created++;
}

console.log("ALAI targeted graph repair completed.");
console.log({ created });

console.table(db.prepare(`
  SELECT
    c.name,
    c.status,
    COUNT(DISTINCT r.id) AS relations,
    COUNT(DISTINCT cel.evidence_id) AS evidence,
    COALESCE(MAX(g.passed),0) AS grounded,
    COALESCE(MAX(a.passed),0) AS autonomous,
    COALESCE(cm.mastery_score,0) AS mastery
  FROM concepts c
  LEFT JOIN relations r ON r.from_concept_id = c.id OR r.to_concept_id = c.id
  LEFT JOIN concept_evidence_links cel ON cel.concept_id = c.id
  LEFT JOIN alai_evidence_grounded_exams g ON g.concept_id = c.id
  LEFT JOIN alai_autonomous_exams a ON a.concept_id = c.id
  LEFT JOIN concept_mastery cm ON cm.concept_id = c.id
  WHERE c.name = 'Complex number'
  GROUP BY c.id
`).all());

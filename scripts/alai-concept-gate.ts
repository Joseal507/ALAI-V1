import Database from "better-sqlite3";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS concept_prerequisites (
  concept_id TEXT NOT NULL,
  prerequisite_concept_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (concept_id, prerequisite_concept_id),
  FOREIGN KEY (concept_id) REFERENCES concepts(id),
  FOREIGN KEY (prerequisite_concept_id) REFERENCES concepts(id)
);
`);

function conceptId(name: string) {
  const row = db.prepare(`
    SELECT id FROM concepts
    WHERE lower(name) = lower(?)
    LIMIT 1
  `).get(name) as { id: string } | undefined;

  return row?.id ?? null;
}

function addPrereq(concept: string, prereq: string) {
  const c = conceptId(concept);
  const p = conceptId(prereq);

  if (!c || !p || c === p) return false;

  db.prepare(`
    INSERT OR IGNORE INTO concept_prerequisites (
      concept_id,
      prerequisite_concept_id,
      created_at
    ) VALUES (?, ?, ?)
  `).run(c, p, now);

  return true;
}

let inserted = 0;

const rules: [string, string][] = [
  ["Expression", "Variable"],
  ["Expression", "Constant"],
  ["Term", "Variable"],
  ["Coefficient", "Term"],
  ["Like terms", "Term"],
  ["Evaluate expression", "Expression"],
  ["Linear equation", "Equation"],
  ["Linear equation", "Variable"],
  ["Solution", "Linear equation"],
  ["One-step equation", "Linear equation"],
  ["Two-step equation", "One-step equation"],
  ["Combine like terms", "Like terms"],
  ["Simplify expression", "Expression"],
  ["Distributive property", "Expression"],
  ["Expand expression", "Distributive property"],
  ["Factor expression", "Expression"],
  ["Coordinate plane", "Ordered pair"],
  ["Line graph", "Coordinate plane"],
  ["Slope", "Line graph"],
  ["Y-intercept", "Line graph"],
  ["Slope-intercept form", "Slope"],
  ["Slope-intercept form", "Y-intercept"],
  ["Standard form equation", "Linear equation"],
];

for (const [concept, prereq] of rules) {
  if (addPrereq(concept, prereq)) inserted++;
}

const locked = db.prepare(`
  SELECT
    c.name AS concept,
    COUNT(cp.prerequisite_concept_id) AS prerequisites,
    SUM(
      CASE
        WHEN pc.status = 'VERIFIED'
          OR COALESCE(cm.mastery_score, 0) >= 0.82
        THEN 1
        ELSE 0
      END
    ) AS passed
  FROM concept_prerequisites cp
  JOIN concepts c ON c.id = cp.concept_id
  JOIN concepts pc ON pc.id = cp.prerequisite_concept_id
  LEFT JOIN concept_mastery cm ON cm.concept_id = pc.id
  GROUP BY c.id
  HAVING passed < prerequisites
  ORDER BY c.name
`).all();

console.log("ALAI concept gate completed.");
console.log({ prerequisiteRulesInsertedOrExisting: inserted });
console.table(locked);

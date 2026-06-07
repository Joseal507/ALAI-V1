import Database from "better-sqlite3";
import { getActiveLearningDomain } from "../src/learning/education-progression";

const db = new Database("data/alai.db");
const now = new Date().toISOString();
const active = getActiveLearningDomain(db);

db.exec(`
CREATE TABLE IF NOT EXISTS concept_stage_flags (
  concept_id TEXT PRIMARY KEY,
  stage TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (concept_id) REFERENCES concepts(id)
);
`);

const advancedPatterns = [
  "neuroscience",
  "molecular biology",
  "cancer research",
  "biomedical research",
  "genetics",
  "rotational motion",
  "calculus",
  "topology",
  "topos",
  "number theory",
  "set theory",
  "ring theory",
  "group theory",
  "categorical algebra",
  "algebraic k-theory",
];

let frozen = 0;

for (const pattern of advancedPatterns) {
  const rows = db.prepare(`
    SELECT id, name
    FROM concepts
    WHERE lower(name) LIKE ?
  `).all(`%${pattern}%`) as { id: string; name: string }[];

  for (const row of rows) {
    db.prepare(`
      INSERT INTO concept_stage_flags (
        concept_id,
        stage,
        reason,
        status,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(concept_id) DO UPDATE SET
        stage = excluded.stage,
        reason = excluded.reason,
        status = excluded.status,
        updated_at = excluded.updated_at
    `).run(
      row.id,
      "ADVANCED",
      `Frozen while active domain is ${active.domainName}.`,
      "FROZEN",
      now,
      now
    );

    db.prepare(`
      UPDATE concepts
      SET status = 'PENDING',
          updated_at = ?
      WHERE id = ?
    `).run(now, row.id);

    frozen++;
  }
}

console.log("ALAI future concept freezer completed.");
console.log({
  activeDomain: active.domainName,
  frozen,
});

console.table(db.prepare(`
  SELECT c.name, f.stage, f.status, f.reason
  FROM concept_stage_flags f
  JOIN concepts c ON c.id = f.concept_id
  ORDER BY c.name
  LIMIT 30
`).all());

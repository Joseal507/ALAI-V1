import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_v2_domain_mastery_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  concepts_scanned INTEGER NOT NULL DEFAULT 0,
  mastery_tasks_created INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'RUNNING'
);

CREATE TABLE IF NOT EXISTS alai_v2_mastery_tasks (
  id TEXT PRIMARY KEY,
  concept_id TEXT,
  concept_name TEXT NOT NULL,
  task_type TEXT NOT NULL,
  prompt TEXT NOT NULL,
  priority_score REAL NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(concept_name, task_type, prompt)
);
`);

const runId = crypto.randomUUID();

db.prepare(`
INSERT INTO alai_v2_domain_mastery_runs (id, started_at, status)
VALUES (?, ?, 'RUNNING')
`).run(runId, now);

const concepts = db.prepare(`
SELECT
  c.id,
  c.name,
  c.status,
  COALESCE(cm.mastery_score,0) AS mastery,
  COUNT(DISTINCT cel.evidence_id) AS evidenceCount,
  COUNT(DISTINCT r.id) AS relationCount
FROM concepts c
LEFT JOIN concept_mastery cm ON cm.concept_id=c.id
LEFT JOIN concept_evidence_links cel ON cel.concept_id=c.id
LEFT JOIN relations r ON r.from_concept_id=c.id OR r.to_concept_id=c.id
WHERE c.status IN ('PENDING','VERIFIED','CANONICAL')
GROUP BY c.id
HAVING mastery < 0.82 OR evidenceCount < 2 OR relationCount < 3
ORDER BY
  CASE c.status WHEN 'CANONICAL' THEN 0 WHEN 'VERIFIED' THEN 1 ELSE 2 END,
  mastery ASC,
  evidenceCount ASC,
  relationCount ASC
LIMIT 500
`).all() as any[];

let created = 0;

for (const c of concepts) {
  const tasks = [
    ["EXPLAIN", `Explain ${c.name} clearly at beginner, intermediate, and technical levels.`],
    ["APPLY", `Give practical examples and applications of ${c.name}.`],
    ["COMPARE", `Compare ${c.name} with nearby or commonly confused concepts.`],
    ["TEST", `Create mastery questions that prove understanding of ${c.name}.`],
    ["RELATE", `Identify safe prerequisite, part-of, application, or contrast relations for ${c.name}.`]
  ];

  const priority = Math.max(0.55, Math.min(0.98, 1 - Number(c.mastery || 0)));

  for (const [type, prompt] of tasks) {
    const result = db.prepare(`
      INSERT OR IGNORE INTO alai_v2_mastery_tasks
      (id, concept_id, concept_name, task_type, prompt, priority_score, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)
    `).run(
      crypto.randomUUID(),
      c.id,
      c.name,
      type,
      prompt,
      priority,
      now,
      now
    );
    created += result.changes;
  }
}

db.prepare(`
UPDATE alai_v2_domain_mastery_runs
SET finished_at=?,
    concepts_scanned=?,
    mastery_tasks_created=?,
    status='COMPLETED'
WHERE id=?
`).run(new Date().toISOString(), concepts.length, created, runId);

console.log("ALAI V2 domain mastery expansion completed.");
console.log({ conceptsScanned: concepts.length, masteryTasksCreated: created });

db.close();

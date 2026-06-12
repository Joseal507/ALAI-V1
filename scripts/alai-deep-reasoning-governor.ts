import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_deep_reasoning_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  concepts_scanned INTEGER NOT NULL DEFAULT 0,
  reasoning_tasks_created INTEGER NOT NULL DEFAULT 0,
  reasoning_paths_created INTEGER NOT NULL DEFAULT 0,
  weak_paths_found INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'RUNNING'
);

CREATE TABLE IF NOT EXISTS alai_reasoning_tasks (
  id TEXT PRIMARY KEY,
  task_type TEXT NOT NULL,
  prompt TEXT NOT NULL UNIQUE,
  from_concept_id TEXT,
  to_concept_id TEXT,
  expected_depth INTEGER NOT NULL DEFAULT 2,
  priority_score REAL NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alai_reasoning_paths (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  path_text TEXT NOT NULL,
  path_depth INTEGER NOT NULL,
  confidence_score REAL NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'PROVISIONAL',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);

type Concept = {
  id: string;
  name: string;
  status: string;
  mastery: number;
  relations: number;
  evidence: number;
};

const runId = crypto.randomUUID();

db.prepare(`
INSERT INTO alai_deep_reasoning_runs (id, started_at, status)
VALUES (?, ?, 'RUNNING')
`).run(runId, now);

const concepts = db.prepare(`
SELECT
  c.id,
  c.name,
  c.status,
  COALESCE(cm.mastery_score,0) AS mastery,
  COUNT(DISTINCT r.id) AS relations,
  COUNT(DISTINCT cel.evidence_id) AS evidence
FROM concepts c
LEFT JOIN concept_mastery cm ON cm.concept_id=c.id
LEFT JOIN relations r ON r.from_concept_id=c.id OR r.to_concept_id=c.id
LEFT JOIN concept_evidence_links cel ON cel.concept_id=c.id
WHERE c.status IN ('VERIFIED','CANONICAL')
GROUP BY c.id
HAVING relations >= 2
ORDER BY mastery DESC, relations DESC, evidence DESC
LIMIT 300
`).all() as Concept[];

let tasksCreated = 0;
let pathsCreated = 0;
let weakPaths = 0;

const insertTask = db.prepare(`
INSERT OR IGNORE INTO alai_reasoning_tasks (
  id, task_type, prompt, from_concept_id, to_concept_id, expected_depth, priority_score, status, created_at, updated_at
)
VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)
`);

const insertPath = db.prepare(`
INSERT INTO alai_reasoning_paths (
  id, task_id, path_text, path_depth, confidence_score, status, created_at, updated_at
)
VALUES (?, ?, ?, ?, ?, 'PROVISIONAL', ?, ?)
`);

for (const concept of concepts) {
  const neighbors = db.prepare(`
    SELECT
      r.relation_type AS relationType,
      c2.id AS id,
      c2.name AS name,
      c2.status AS status
    FROM relations r
    JOIN concepts c2 ON c2.id = CASE
      WHEN r.from_concept_id = ? THEN r.to_concept_id
      ELSE r.from_concept_id
    END
    WHERE (r.from_concept_id=? OR r.to_concept_id=?)
      AND c2.status IN ('VERIFIED','CANONICAL')
    GROUP BY c2.id
    LIMIT 8
  `).all(concept.id, concept.id, concept.id) as any[];

  if (neighbors.length < 2) {
    weakPaths++;
    continue;
  }

  for (let i = 0; i < Math.min(3, neighbors.length); i++) {
    for (let j = i + 1; j < Math.min(5, neighbors.length); j++) {
      const a = neighbors[i];
      const b = neighbors[j];

      const prompt = `Explain a multi-step reasoning path connecting ${a.name}, ${concept.name}, and ${b.name}.`;

      const taskId = crypto.randomUUID();

      const result = insertTask.run(
        taskId,
        "MULTI_HOP_CONCEPT_REASONING",
        prompt,
        a.id,
        b.id,
        3,
        Math.min(0.95, 0.55 + concept.mastery * 0.3 + Math.min(0.1, concept.relations / 200)),
        now,
        now
      );

      if (result.changes > 0) {
        tasksCreated++;

        insertPath.run(
          crypto.randomUUID(),
          taskId,
          `${a.name} --${a.relationType}--> ${concept.name} --${b.relationType}--> ${b.name}`,
          3,
          Math.min(0.95, 0.6 + concept.mastery * 0.3),
          now,
          now
        );

        pathsCreated++;
      }
    }
  }
}

db.prepare(`
UPDATE alai_deep_reasoning_runs
SET finished_at=?,
    concepts_scanned=?,
    reasoning_tasks_created=?,
    reasoning_paths_created=?,
    weak_paths_found=?,
    status='COMPLETED'
WHERE id=?
`).run(new Date().toISOString(), concepts.length, tasksCreated, pathsCreated, weakPaths, runId);

console.log("ALAI deep reasoning governor completed.");
console.log({ conceptsScanned: concepts.length, tasksCreated, pathsCreated, weakPaths });

db.close();

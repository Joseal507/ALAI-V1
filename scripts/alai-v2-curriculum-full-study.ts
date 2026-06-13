import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_v2_curriculum_full_study_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  domains_scanned INTEGER NOT NULL DEFAULT 0,
  objectives_created INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'RUNNING'
);

CREATE TABLE IF NOT EXISTS alai_v2_curriculum_full_study_queue (
  id TEXT PRIMARY KEY,
  domain_id TEXT,
  domain_name TEXT NOT NULL,
  topic_id TEXT,
  topic_name TEXT,
  objective TEXT NOT NULL,
  priority_score REAL NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(domain_name, topic_name, objective)
);
`);

const runId = crypto.randomUUID();

db.prepare(`
INSERT INTO alai_v2_curriculum_full_study_runs (id, started_at, status)
VALUES (?, ?, 'RUNNING')
`).run(runId, now);

const domains = db.prepare(`
SELECT
  d.id AS domainId,
  d.name AS domainName,
  COALESCE(r.rollup_coverage_score,0) AS coverage
FROM academic_domains d
LEFT JOIN domain_coverage_rollup r ON r.domain_id=d.id
ORDER BY coverage ASC, d.name ASC
LIMIT 30
`).all() as any[];

let created = 0;

for (const d of domains) {
  const topics = db.prepare(`
    SELECT id, name
    FROM curriculum_topics
    WHERE domain_id=?
    ORDER BY name ASC
    LIMIT 12
  `).all(d.domainId) as any[];

  const priority = Math.max(0.55, Math.min(0.99, 1 - Number(d.coverage || 0)));

  if (topics.length === 0) {
    const result = db.prepare(`
      INSERT OR IGNORE INTO alai_v2_curriculum_full_study_queue
      (id, domain_id, domain_name, topic_id, topic_name, objective, priority_score, status, created_at, updated_at)
      VALUES (?, ?, ?, NULL, NULL, ?, ?, 'OPEN', ?, ?)
    `).run(
      crypto.randomUUID(),
      d.domainId,
      d.domainName,
      `Build foundational curriculum map for ${d.domainName}: concepts, prerequisites, evidence, applications, tests.`,
      priority,
      now,
      now
    );
    created += result.changes;
    continue;
  }

  for (const t of topics) {
    const result = db.prepare(`
      INSERT OR IGNORE INTO alai_v2_curriculum_full_study_queue
      (id, domain_id, domain_name, topic_id, topic_name, objective, priority_score, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)
    `).run(
      crypto.randomUUID(),
      d.domainId,
      d.domainName,
      t.id,
      t.name,
      `Study ${t.name} inside ${d.domainName}: core concepts, prerequisites, evidence, examples, relation checks, mastery tests.`,
      priority,
      now,
      now
    );
    created += result.changes;
  }
}

db.prepare(`
UPDATE alai_v2_curriculum_full_study_runs
SET finished_at=?,
    domains_scanned=?,
    objectives_created=?,
    status='COMPLETED'
WHERE id=?
`).run(new Date().toISOString(), domains.length, created, runId);

console.log("ALAI V2 curriculum full study completed.");
console.log({ domainsScanned: domains.length, objectivesCreated: created });

console.table(db.prepare(`
SELECT domain_name, COUNT(*) AS objectives
FROM alai_v2_curriculum_full_study_queue
WHERE status='OPEN'
GROUP BY domain_name
ORDER BY objectives DESC
LIMIT 12
`).all());

db.close();

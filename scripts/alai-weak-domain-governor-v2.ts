import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_weak_domain_governor_v2_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  domains_scanned INTEGER NOT NULL DEFAULT 0,
  questions_created INTEGER NOT NULL DEFAULT 0,
  objectives_created INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'RUNNING'
);
`);

function insertQuestion(domainName: string, priority: number): number {
  const question = `What concepts, evidence, applications, and reasoning tests are needed to strengthen weak domain ${domainName}?`;
  const existing = db.prepare(`
    SELECT id FROM alai_research_questions
    WHERE lower(question)=lower(?)
      AND status IN ('OPEN','IN_PROGRESS','ANSWERED','BLOCKED')
    LIMIT 1
  `).get(question);

  if (existing) return 0;

  db.prepare(`
    INSERT INTO alai_research_questions
    (id, concept_id, topic_id, question, question_type, priority_score, status, created_at, updated_at)
    VALUES (?, NULL, NULL, ?, 'WEAK_DOMAIN_DISCOVERY', ?, 'OPEN', ?, ?)
  `).run(crypto.randomUUID(), question, priority, now, now);

  return 1;
}

function insertObjective(domainName: string, priority: number): number {
  db.exec(`
  CREATE TABLE IF NOT EXISTS alai_executive_objectives (
    id TEXT PRIMARY KEY,
    objective TEXT NOT NULL,
    priority REAL NOT NULL DEFAULT 0.5,
    status TEXT NOT NULL DEFAULT 'OPEN',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT ''
  );
  `);

  const objective = `Strengthen weak domain automatically: ${domainName}`;

  const existing = db.prepare(`
    SELECT id FROM alai_executive_objectives
    WHERE lower(objective)=lower(?)
      AND status IN ('OPEN','RUNNING')
    LIMIT 1
  `).get(objective);

  if (existing) return 0;

  db.prepare(`
    INSERT INTO alai_executive_objectives
    (id, objective, priority, status, created_at, updated_at, description)
    VALUES (?, ?, ?, 'OPEN', ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    objective,
    priority,
    now,
    now,
    `ALAI detected weak domain ${domainName}. It must discover missing concepts, evidence, relations, and tests.`
  );

  return 1;
}

const runId = crypto.randomUUID();

db.prepare(`
INSERT INTO alai_weak_domain_governor_v2_runs (id, started_at, status)
VALUES (?, ?, 'RUNNING')
`).run(runId, now);

const domains = db.prepare(`
SELECT
  d.id,
  d.name,
  COALESCE(r.rollup_coverage_score,0) AS coverage,
  COALESCE(r.concepts_total,0) AS concepts,
  COALESCE(r.concepts_mastered,0) AS mastered
FROM academic_domains d
LEFT JOIN domain_coverage_rollup r ON r.domain_id=d.id
ORDER BY coverage ASC, concepts DESC
LIMIT 12
`).all() as any[];

let questionsCreated = 0;
let objectivesCreated = 0;

for (const d of domains) {
  const coverage = Number(d.coverage || 0);
  if (coverage >= 0.85) continue;
  const priority = Math.max(0.55, Math.min(0.98, 1 - coverage));
  questionsCreated += insertQuestion(String(d.name), priority);
  objectivesCreated += insertObjective(String(d.name), priority);
}

db.prepare(`
UPDATE alai_weak_domain_governor_v2_runs
SET finished_at=?,
    domains_scanned=?,
    questions_created=?,
    objectives_created=?,
    status='COMPLETED'
WHERE id=?
`).run(new Date().toISOString(), domains.length, questionsCreated, objectivesCreated, runId);

console.log("ALAI weak domain governor v2 completed.");
console.log({ domainsScanned: domains.length, questionsCreated, objectivesCreated });

db.close();

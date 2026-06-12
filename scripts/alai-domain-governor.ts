import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_domain_governor_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  domains_scanned INTEGER NOT NULL DEFAULT 0,
  objectives_created INTEGER NOT NULL DEFAULT 0,
  research_questions_created INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'RUNNING'
);

CREATE TABLE IF NOT EXISTS alai_domain_learning_objectives (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL,
  domain_name TEXT NOT NULL,
  objective TEXT NOT NULL,
  priority_score REAL NOT NULL DEFAULT 0.5,
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(domain_id, objective)
);
`);

type DomainRow = {
  domainId: string;
  domainName: string;
  rollup: number;
  topics: number;
  conceptsTotal: number;
  conceptsMastered: number;
  openGaps: number;
};

function createObjective(domain: DomainRow): boolean {
  const missingCoverage = Number((1 - Math.min(domain.rollup || 0, 1)).toFixed(3));
  const priority = Math.max(0.55, Math.min(0.98, missingCoverage + domain.openGaps * 0.01));

  const objective = `Strengthen curriculum coverage and mastery for ${domain.domainName}.`;
  const reason = `rollup=${domain.rollup}; topics=${domain.topics}; concepts=${domain.conceptsTotal}; mastered=${domain.conceptsMastered}; openGaps=${domain.openGaps}`;

  const result = db.prepare(`
    INSERT OR IGNORE INTO alai_domain_learning_objectives (
      id, domain_id, domain_name, objective, priority_score, reason, status, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)
  `).run(
    crypto.randomUUID(),
    domain.domainId,
    domain.domainName,
    objective,
    priority,
    reason,
    now,
    now
  );

  return result.changes > 0;
}

function createResearchQuestion(domain: DomainRow): boolean {
  const question = `What should ALAI learn next to improve the weak domain ${domain.domainName}?`;

  const existing = db.prepare(`
    SELECT id
    FROM alai_research_questions
    WHERE lower(question)=lower(?)
      AND status IN ('OPEN','IN_PROGRESS','ANSWERED','BLOCKED')
    LIMIT 1
  `).get(question);

  if (existing) return false;

  const result = db.prepare(`
    INSERT INTO alai_research_questions (
      id, concept_id, topic_id, question, question_type, priority_score, status, created_at, updated_at
    )
    VALUES (?, NULL, NULL, ?, 'DOMAIN_GAP', ?, 'OPEN', ?, ?)
  `).run(
    crypto.randomUUID(),
    question,
    Math.max(0.72, Math.min(0.98, 1 - domain.rollup)),
    now,
    now
  );

  return result.changes > 0;
}

const runId = crypto.randomUUID();

db.prepare(`
  INSERT INTO alai_domain_governor_runs (id, started_at, status)
  VALUES (?, ?, 'RUNNING')
`).run(runId, now);

const domains = db.prepare(`
SELECT
  d.id AS domainId,
  d.name AS domainName,
  COALESCE(dr.rollup_coverage_score, 0) AS rollup,
  COALESCE(dr.topics_count, 0) AS topics,
  COALESCE(dr.concepts_total, 0) AS conceptsTotal,
  COALESCE(dr.concepts_mastered, 0) AS conceptsMastered,
  COUNT(DISTINCT kg.id) AS openGaps
FROM academic_domains d
LEFT JOIN domain_coverage_rollup dr ON dr.domain_id=d.id
LEFT JOIN curriculum_topics t ON t.domain_id=d.id
LEFT JOIN topic_concepts tc ON tc.topic_id=t.id
LEFT JOIN knowledge_gaps kg ON kg.concept_id=tc.concept_id AND kg.status='OPEN'
GROUP BY d.id
ORDER BY rollup ASC, openGaps DESC, conceptsTotal ASC
LIMIT 12
`).all() as DomainRow[];

let objectivesCreated = 0;
let researchQuestionsCreated = 0;

for (const domain of domains) {
  if (domain.rollup >= 0.9 && domain.openGaps === 0) continue;

  if (createObjective(domain)) objectivesCreated++;
  if (createResearchQuestion(domain)) researchQuestionsCreated++;
}

db.prepare(`
  UPDATE alai_domain_governor_runs
  SET finished_at=?,
      domains_scanned=?,
      objectives_created=?,
      research_questions_created=?,
      status='COMPLETED'
  WHERE id=?
`).run(new Date().toISOString(), domains.length, objectivesCreated, researchQuestionsCreated, runId);

console.log("ALAI domain governor completed.");
console.log({ domainsScanned: domains.length, objectivesCreated, researchQuestionsCreated });

console.table(db.prepare(`
SELECT
  domain_name AS domain,
  priority_score AS priority,
  status,
  reason
FROM alai_domain_learning_objectives
ORDER BY priority_score DESC, created_at ASC
LIMIT 20
`).all());

db.close();

import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_autonomous_curiosity_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  weak_domains_scanned INTEGER NOT NULL DEFAULT 0,
  concepts_scanned INTEGER NOT NULL DEFAULT 0,
  hypotheses_created INTEGER NOT NULL DEFAULT 0,
  research_questions_created INTEGER NOT NULL DEFAULT 0,
  executive_objectives_created INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'RUNNING'
);

CREATE TABLE IF NOT EXISTS alai_hypotheses (
  id TEXT PRIMARY KEY,
  hypothesis TEXT NOT NULL UNIQUE,
  hypothesis_type TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT,
  target_name TEXT NOT NULL,
  priority_score REAL NOT NULL DEFAULT 0.5,
  confidence_score REAL NOT NULL DEFAULT 0.35,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alai_world_model_focus (
  id TEXT PRIMARY KEY,
  focus_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  target_name TEXT NOT NULL,
  reason TEXT NOT NULL,
  priority_score REAL NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(focus_type, target_type, target_name)
);
`);

type Domain = {
  id: string;
  name: string;
  rollup: number;
  topics: number;
  conceptsTotal: number;
  conceptsMastered: number;
};

type Concept = {
  id: string;
  name: string;
  status: string;
  mastery: number;
  evidenceCount: number;
  relationCount: number;
};

function insertResearchQuestion(question: string, questionType: string, priority: number, conceptId: string | null, topicId: string | null): boolean {
  const existing = db.prepare(`
    SELECT id
    FROM alai_research_questions
    WHERE lower(question)=lower(?)
      AND status IN ('OPEN','IN_PROGRESS','ANSWERED','BLOCKED')
    LIMIT 1
  `).get(question);

  if (existing) return false;

  db.prepare(`
    INSERT INTO alai_research_questions (
      id,
      concept_id,
      topic_id,
      question,
      question_type,
      priority_score,
      status,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)
  `).run(
    crypto.randomUUID(),
    conceptId,
    topicId,
    question,
    questionType,
    priority,
    now,
    now
  );

  return true;
}

function insertHypothesis(hypothesis: string, type: string, sourceType: string, sourceId: string | null, targetName: string, priority: number): boolean {
  const result = db.prepare(`
    INSERT OR IGNORE INTO alai_hypotheses (
      id,
      hypothesis,
      hypothesis_type,
      source_type,
      source_id,
      target_name,
      priority_score,
      confidence_score,
      status,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 0.35, 'OPEN', ?, ?)
  `).run(
    crypto.randomUUID(),
    hypothesis,
    type,
    sourceType,
    sourceId,
    targetName,
    priority,
    now,
    now
  );

  return result.changes > 0;
}

function insertFocus(focusType: string, targetType: string, targetId: string | null, targetName: string, reason: string, priority: number): boolean {
  const result = db.prepare(`
    INSERT OR IGNORE INTO alai_world_model_focus (
      id,
      focus_type,
      target_type,
      target_id,
      target_name,
      reason,
      priority_score,
      status,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)
  `).run(
    crypto.randomUUID(),
    focusType,
    targetType,
    targetId,
    targetName,
    reason,
    priority,
    now,
    now
  );

  return result.changes > 0;
}

function insertExecutiveObjective(title: string, description: string, priority: number): boolean {
  db.exec(`
  CREATE TABLE IF NOT EXISTS alai_executive_objectives (
    id TEXT PRIMARY KEY,
    objective TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    priority_score REAL NOT NULL DEFAULT 0.5,
    status TEXT NOT NULL DEFAULT 'OPEN',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  `);

  const existing = db.prepare(`
    SELECT id
    FROM alai_executive_objectives
    WHERE lower(objective)=lower(?)
      AND status IN ('OPEN','RUNNING')
    LIMIT 1
  `).get(title);

  if (existing) return false;

  db.prepare(`
    INSERT INTO alai_executive_objectives (
      id,
      objective,
      description,
      priority,
      status,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, 'OPEN', ?, ?)
  `).run(
    crypto.randomUUID(),
    title,
    description,
    priority,
    now,
    now
  );

  return true;
}

const runId = crypto.randomUUID();

db.prepare(`
  INSERT INTO alai_autonomous_curiosity_runs (id, started_at, status)
  VALUES (?, ?, 'RUNNING')
`).run(runId, now);

const domains = db.prepare(`
SELECT
  d.id,
  d.name,
  COALESCE(r.rollup_coverage_score, 0) AS rollup,
  COALESCE(r.topics_count, 0) AS topics,
  COALESCE(r.concepts_total, 0) AS conceptsTotal,
  COALESCE(r.concepts_mastered, 0) AS conceptsMastered
FROM academic_domains d
LEFT JOIN domain_coverage_rollup r ON r.domain_id=d.id
ORDER BY rollup ASC, conceptsTotal DESC
LIMIT 12
`).all() as Domain[];

const concepts = db.prepare(`
SELECT
  c.id,
  c.name,
  c.status,
  COALESCE(cm.mastery_score, 0) AS mastery,
  COUNT(DISTINCT cel.evidence_id) AS evidenceCount,
  COUNT(DISTINCT r.id) AS relationCount
FROM concepts c
LEFT JOIN concept_mastery cm ON cm.concept_id=c.id
LEFT JOIN concept_evidence_links cel ON cel.concept_id=c.id
LEFT JOIN relations r ON r.from_concept_id=c.id OR r.to_concept_id=c.id
WHERE c.status IN ('PENDING','VERIFIED','CANONICAL')
GROUP BY c.id
HAVING mastery < 0.72 OR evidenceCount < 2 OR relationCount < 3
ORDER BY
  CASE c.status WHEN 'CANONICAL' THEN 0 WHEN 'VERIFIED' THEN 1 ELSE 2 END,
  mastery ASC,
  evidenceCount ASC,
  relationCount ASC
LIMIT 80
`).all() as Concept[];

let hypothesesCreated = 0;
let researchQuestionsCreated = 0;
let executiveObjectivesCreated = 0;

for (const domain of domains) {
  const priority = Math.max(0.6, Math.min(0.98, 1 - domain.rollup));

  if (insertFocus(
    "WEAK_DOMAIN",
    "DOMAIN",
    domain.id,
    domain.name,
    `Domain coverage is ${domain.rollup}; mastered ${domain.conceptsMastered}/${domain.conceptsTotal}.`,
    priority
  )) {}

  if (insertHypothesis(
    `ALAI likely lacks enough core transferable concepts in ${domain.name} because domain coverage is ${domain.rollup}.`,
    "DOMAIN_COVERAGE_HYPOTHESIS",
    "DOMAIN",
    domain.id,
    domain.name,
    priority
  )) hypothesesCreated++;

  if (insertResearchQuestion(
    `What are the most important missing core concepts ALAI must learn to improve ${domain.name}?`,
    "AUTONOMOUS_DOMAIN_DISCOVERY",
    priority,
    null,
    null
  )) researchQuestionsCreated++;

  if (insertResearchQuestion(
    `Which prerequisite concepts are required before ALAI can reason well about ${domain.name}?`,
    "AUTONOMOUS_PREREQUISITE_DISCOVERY",
    priority,
    null,
    null
  )) researchQuestionsCreated++;

  if (insertExecutiveObjective(
    `Strengthen weak domain: ${domain.name}`,
    `Autonomously discover missing concepts, prerequisite chains, evidence, and reasoning tests for ${domain.name}.`,
    priority
  )) executiveObjectivesCreated++;
}

for (const concept of concepts) {
  const priority = Math.max(0.55, Math.min(0.95, 1 - concept.mastery + (concept.evidenceCount < 2 ? 0.1 : 0)));

  if (insertFocus(
    "WEAK_CONCEPT",
    "CONCEPT",
    concept.id,
    concept.name,
    `Concept mastery=${concept.mastery}; evidence=${concept.evidenceCount}; relations=${concept.relationCount}; status=${concept.status}.`,
    priority
  )) {}

  if (insertHypothesis(
    `ALAI may not truly understand ${concept.name} because mastery, evidence, or relation coverage is incomplete.`,
    "CONCEPT_UNDERSTANDING_HYPOTHESIS",
    "CONCEPT",
    concept.id,
    concept.name,
    priority
  )) hypothesesCreated++;

  if (concept.evidenceCount < 2) {
    if (insertResearchQuestion(
      `What reliable evidence is needed for ALAI to truly understand ${concept.name}?`,
      "AUTONOMOUS_EVIDENCE_DISCOVERY",
      priority,
      concept.id,
      null
    )) researchQuestionsCreated++;
  }

  if (concept.relationCount < 3) {
    if (insertResearchQuestion(
      `What prerequisite, part-of, cause-effect, application, or contrast relations are essential for ${concept.name}?`,
      "AUTONOMOUS_RELATION_DISCOVERY",
      priority,
      concept.id,
      null
    )) researchQuestionsCreated++;
  }

  if (concept.mastery < 0.72) {
    if (insertResearchQuestion(
      `What must ALAI be able to explain, apply, compare, and test to prove mastery of ${concept.name}?`,
      "AUTONOMOUS_MASTERY_DISCOVERY",
      priority,
      concept.id,
      null
    )) researchQuestionsCreated++;
  }
}

db.prepare(`
  UPDATE alai_autonomous_curiosity_runs
  SET finished_at=?,
      weak_domains_scanned=?,
      concepts_scanned=?,
      hypotheses_created=?,
      research_questions_created=?,
      executive_objectives_created=?,
      status='COMPLETED'
  WHERE id=?
`).run(
  new Date().toISOString(),
  domains.length,
  concepts.length,
  hypothesesCreated,
  researchQuestionsCreated,
  executiveObjectivesCreated,
  runId
);

console.log("ALAI autonomous curiosity engine completed.");
console.log({
  weakDomainsScanned: domains.length,
  conceptsScanned: concepts.length,
  hypothesesCreated,
  researchQuestionsCreated,
  executiveObjectivesCreated,
});

console.table(db.prepare(`
SELECT status, COUNT(*) AS count
FROM alai_research_questions
GROUP BY status
`).all());

console.table(db.prepare(`
SELECT hypothesis_type, status, COUNT(*) AS count
FROM alai_hypotheses
GROUP BY hypothesis_type, status
ORDER BY count DESC
`).all());

db.close();

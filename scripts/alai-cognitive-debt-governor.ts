import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_cognitive_debt_governor_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  open_research_before INTEGER NOT NULL DEFAULT 0,
  open_flags_before INTEGER NOT NULL DEFAULT 0,
  pending_before INTEGER NOT NULL DEFAULT 0,
  research_closed INTEGER NOT NULL DEFAULT 0,
  flags_resolved INTEGER NOT NULL DEFAULT 0,
  concepts_rejected INTEGER NOT NULL DEFAULT 0,
  mode TEXT NOT NULL DEFAULT 'CONSOLIDATION',
  status TEXT NOT NULL DEFAULT 'RUNNING'
);
`);

function n(sql: string): number {
  return Number((db.prepare(sql).get() as any)?.n ?? 0);
}

function hasTable(name: string): boolean {
  return !!db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name=?
  `).get(name);
}

const runId = crypto.randomUUID();

const before = {
  openResearch: n(`SELECT COUNT(*) AS n FROM alai_research_questions WHERE status='OPEN'`),
  openFlags: n(`SELECT COUNT(*) AS n FROM alai_quality_flags WHERE status='OPEN'`),
  pending: n(`SELECT COUNT(*) AS n FROM concepts WHERE status='PENDING'`)
};

db.prepare(`
  INSERT INTO alai_cognitive_debt_governor_runs (
    id,
    started_at,
    open_research_before,
    open_flags_before,
    pending_before,
    mode,
    status
  )
  VALUES (?, ?, ?, ?, ?, 'CONSOLIDATION', 'RUNNING')
`).run(runId, now, before.openResearch, before.openFlags, before.pending);

let researchClosed = 0;
let flagsResolved = 0;
let conceptsRejected = 0;

/**
 * 1) Cerrar research questions masivas tipo EVIDENCE_REQUIRED cuando son deuda automática.
 * No inventa evidencia. Las marca BLOCKED para que no sigan saturando la cola.
 */
const evidenceRequired = db.prepare(`
  SELECT id, question
  FROM alai_research_questions
  WHERE status='OPEN'
    AND question_type='EVIDENCE_REQUIRED'
  LIMIT 5000
`).all() as { id: string; question: string }[];

const blockEvidence = db.prepare(`
  UPDATE alai_research_questions
  SET status='BLOCKED',
      updated_at=?
  WHERE id=?
`);

for (const q of evidenceRequired) {
  blockEvidence.run(now, q.id);
  researchClosed++;
}

/**
 * 2) Resolver flags que ya no aplican.
 */
const openFlags = db.prepare(`
  SELECT id, target_type AS targetType, target_id AS targetId, issue_type AS issueType, message
  FROM alai_quality_flags
  WHERE status='OPEN'
`).all() as {
  id: string;
  targetType: string;
  targetId: string;
  issueType: string;
  message: string;
}[];

const resolveFlag = db.prepare(`
  UPDATE alai_quality_flags
  SET status='RESOLVED',
      updated_at=?
  WHERE id=?
`);

const rejectConcept = db.prepare(`
  UPDATE concepts
  SET status='REJECTED',
      confidence_score=MIN(confidence_score, 0.2),
      updated_at=?
  WHERE id=?
    AND status!='CANONICAL'
`);

function evidenceCount(conceptId: string): number {
  if (!hasTable("concept_evidence_links")) return 0;
  return n(`
    SELECT COUNT(*) AS n
    FROM concept_evidence_links
    WHERE concept_id='${conceptId.replaceAll("'", "''")}'
  `);
}

function topicLinkCount(conceptId: string): number {
  if (!hasTable("topic_concepts")) return 0;
  return n(`
    SELECT COUNT(*) AS n
    FROM topic_concepts
    WHERE concept_id='${conceptId.replaceAll("'", "''")}'
  `);
}

function relationCount(conceptId: string): number {
  return n(`
    SELECT COUNT(*) AS n
    FROM relations
    WHERE from_concept_id='${conceptId.replaceAll("'", "''")}'
       OR to_concept_id='${conceptId.replaceAll("'", "''")}'
  `);
}

for (const flag of openFlags) {
  if (flag.targetType !== "CONCEPT") continue;

  const concept = db.prepare(`
    SELECT id, name, status, confidence_score AS confidence
    FROM concepts
    WHERE id=?
    LIMIT 1
  `).get(flag.targetId) as any;

  if (!concept) {
    resolveFlag.run(now, flag.id);
    flagsResolved++;
    continue;
  }

  const ev = evidenceCount(concept.id);
  const topics = topicLinkCount(concept.id);
  const rels = relationCount(concept.id);

  if (flag.issueType === "NO_EVIDENCE" && ev > 0) {
    resolveFlag.run(now, flag.id);
    flagsResolved++;
    continue;
  }

  if (flag.issueType === "ORPHAN_CONCEPT" && topics > 0) {
    resolveFlag.run(now, flag.id);
    flagsResolved++;
    continue;
  }

  const disposable =
    concept.status !== "CANONICAL" &&
    ev === 0 &&
    topics === 0 &&
    rels < 3;

  if (disposable) {
    rejectConcept.run(now, concept.id);
    resolveFlag.run(now, flag.id);
    flagsResolved++;
    conceptsRejected++;
  }
}

/**
 * 3) Resolver flags abiertos de conceptos ya rechazados.
 */
const rejectedFlags = db.prepare(`
  SELECT q.id
  FROM alai_quality_flags q
  JOIN concepts c ON c.id=q.target_id
  WHERE q.status='OPEN'
    AND q.target_type='CONCEPT'
    AND c.status='REJECTED'
`).all() as { id: string }[];

for (const f of rejectedFlags) {
  resolveFlag.run(now, f.id);
  flagsResolved++;
}

/**
 * 4) Cerrar decisiones ejecutivas duplicadas: si ya existe una COMPLETED igual, las OPEN repetidas se completan.
 */
db.prepare(`
UPDATE alai_executive_decisions
SET status='COMPLETED',
    updated_at=?
WHERE status='OPEN'
AND EXISTS (
  SELECT 1
  FROM alai_executive_decisions d2
  WHERE d2.decision_type=alai_executive_decisions.decision_type
    AND d2.target_name=alai_executive_decisions.target_name
    AND d2.status='COMPLETED'
)
`).run(now);

/**
 * 5) Registrar memoria episódica de consolidación.
 */
db.exec(`
CREATE TABLE IF NOT EXISTS alai_episodic_memories (
  id TEXT PRIMARY KEY,
  episode_type TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  outcome TEXT NOT NULL,
  lesson TEXT NOT NULL,
  importance_score REAL NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(episode_type, title, summary)
);
`);

db.prepare(`
INSERT OR IGNORE INTO alai_episodic_memories (
  id,
  episode_type,
  title,
  summary,
  outcome,
  lesson,
  importance_score,
  status,
  created_at,
  updated_at
)
VALUES (?, 'SELF_CORRECTION', 'Cognitive debt consolidation', ?, ?, ?, 0.97, 'ACTIVE', ?, ?)
`).run(
  crypto.randomUUID(),
  `Before consolidation: ${before.openResearch} open research, ${before.openFlags} open flags, ${before.pending} pending concepts.`,
  `Closed or blocked ${researchClosed} research items, resolved ${flagsResolved} flags, rejected ${conceptsRejected} unconsolidated concepts.`,
  "When evidence debt or quality flags are high, ALAI must consolidate before expanding.",
  now,
  now
);

db.prepare(`
  UPDATE alai_cognitive_debt_governor_runs
  SET finished_at=?,
      research_closed=?,
      flags_resolved=?,
      concepts_rejected=?,
      status='COMPLETED'
  WHERE id=?
`).run(
  new Date().toISOString(),
  researchClosed,
  flagsResolved,
  conceptsRejected,
  runId
);

console.log("ALAI cognitive debt governor completed.");
console.log({
  before,
  researchClosed,
  flagsResolved,
  conceptsRejected,
  after: {
    openResearch: n(`SELECT COUNT(*) AS n FROM alai_research_questions WHERE status='OPEN'`),
    openFlags: n(`SELECT COUNT(*) AS n FROM alai_quality_flags WHERE status='OPEN'`),
    pending: n(`SELECT COUNT(*) AS n FROM concepts WHERE status='PENDING'`)
  }
});

db.close();

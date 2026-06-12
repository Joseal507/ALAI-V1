import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_world_model_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  focus_items_scanned INTEGER NOT NULL DEFAULT 0,
  concepts_created INTEGER NOT NULL DEFAULT 0,
  relations_created INTEGER NOT NULL DEFAULT 0,
  evidence_created INTEGER NOT NULL DEFAULT 0,
  hypotheses_updated INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'RUNNING'
);

CREATE TABLE IF NOT EXISTS alai_world_model_claims (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,
  target_id TEXT,
  target_name TEXT NOT NULL,
  claim TEXT NOT NULL UNIQUE,
  claim_type TEXT NOT NULL,
  confidence_score REAL NOT NULL DEFAULT 0.55,
  status TEXT NOT NULL DEFAULT 'PROVISIONAL',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);

type Focus = {
  id: string;
  focusType: string;
  targetType: string;
  targetId: string | null;
  targetName: string;
  reason: string;
  priorityScore: number;
};

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getOrCreateConcept(name: string, description: string): { id: string; created: boolean } {
  const existing = db.prepare(`
    SELECT id
    FROM concepts
    WHERE lower(name)=lower(?)
    LIMIT 1
  `).get(name) as { id: string } | undefined;

  if (existing) return { id: existing.id, created: false };

  const id = crypto.randomUUID();

  db.prepare(`
    INSERT INTO concepts (
      id,
      name,
      description,
      status,
      confidence_score,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, 'PENDING', 0.58, ?, ?)
  `).run(id, name, description, now, now);

  return { id, created: true };
}

function insertRelation(fromId: string, toId: string, type: string, confidence: number): boolean {
  const existing = db.prepare(`
    SELECT id
    FROM relations
    WHERE from_concept_id=?
      AND to_concept_id=?
      AND relation_type=?
    LIMIT 1
  `).get(fromId, toId, type);

  if (existing) return false;

  db.prepare(`
    INSERT INTO relations (
      id,
      from_concept_id,
      to_concept_id,
      relation_type,
      confidence_score,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    fromId,
    toId,
    type,
    confidence,
    now,
    now
  );

  return true;
}

function insertEvidence(conceptId: string, summary: string): boolean {
  const evidenceId = crypto.randomUUID();

  db.prepare(`
    INSERT INTO evidence (
      id,
      source_type,
      source_name,
      source_url,
      content_summary,
      reliability_score,
      captured_at
    )
    VALUES (?, 'ALAI_WORLD_MODEL', 'ALAI World Model Builder', NULL, ?, 0.68, ?)
  `).run(evidenceId, summary, now);

  db.prepare(`
    INSERT OR IGNORE INTO concept_evidence_links (concept_id, evidence_id)
    VALUES (?, ?)
  `).run(conceptId, evidenceId);

  return true;
}

function insertClaim(targetType: string, targetId: string | null, targetName: string, claim: string, type: string, confidence: number): boolean {
  const result = db.prepare(`
    INSERT OR IGNORE INTO alai_world_model_claims (
      id,
      target_type,
      target_id,
      target_name,
      claim,
      claim_type,
      confidence_score,
      status,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 'PROVISIONAL', ?, ?)
  `).run(
    crypto.randomUUID(),
    targetType,
    targetId,
    targetName,
    claim,
    type,
    confidence,
    now,
    now
  );

  return result.changes > 0;
}

const runId = crypto.randomUUID();

db.prepare(`
  INSERT INTO alai_world_model_runs (id, started_at, status)
  VALUES (?, ?, 'RUNNING')
`).run(runId, now);

const focusItems = db.prepare(`
SELECT
  id,
  focus_type AS focusType,
  target_type AS targetType,
  target_id AS targetId,
  target_name AS targetName,
  reason,
  priority_score AS priorityScore
FROM alai_world_model_focus
WHERE status='OPEN'
ORDER BY priority_score DESC, created_at ASC
LIMIT 80
`).all() as Focus[];

let conceptsCreated = 0;
let relationsCreated = 0;
let evidenceCreated = 0;
let hypothesesUpdated = 0;

for (const focus of focusItems) {
  const target = getOrCreateConcept(focus.targetName, `World model target: ${focus.reason}`);
  if (target.created) conceptsCreated++;

  const understanding = getOrCreateConcept(
    `${focus.targetName} Understanding Model`,
    `A structured model for explaining, applying, comparing, and testing ${focus.targetName}.`
  );
  if (understanding.created) conceptsCreated++;

  const evidence = getOrCreateConcept(
    `${focus.targetName} Evidence Requirements`,
    `Reliable sources and evidence needed to validate knowledge about ${focus.targetName}.`
  );
  if (evidence.created) conceptsCreated++;

  const reasoning = getOrCreateConcept(
    `${focus.targetName} Reasoning Tests`,
    `Questions and tasks that prove whether ALAI can reason about ${focus.targetName}.`
  );
  if (reasoning.created) conceptsCreated++;

  if (insertRelation(target.id, understanding.id, "REQUIRES", 0.72)) relationsCreated++;
  if (insertRelation(target.id, evidence.id, "REQUIRES", 0.72)) relationsCreated++;
  if (insertRelation(target.id, reasoning.id, "REQUIRES", 0.72)) relationsCreated++;
  if (insertRelation(reasoning.id, target.id, "TESTS", 0.7)) relationsCreated++;

  insertEvidence(target.id, `${focus.targetName}: ${focus.reason}`);
  insertEvidence(understanding.id, `${focus.targetName} requires explanations, examples, applications, comparisons, and error detection.`);
  insertEvidence(evidence.id, `${focus.targetName} requires external or internally validated evidence before high-confidence promotion.`);
  insertEvidence(reasoning.id, `${focus.targetName} requires reasoning challenges, semantic truth checks, and competency exams.`);
  evidenceCreated += 4;

  if (insertClaim(
    focus.targetType,
    focus.targetId,
    focus.targetName,
    `${focus.targetName} should not be considered mastered until ALAI can explain it, relate it, apply it, and pass semantic reasoning checks.`,
    "MASTERY_STANDARD",
    0.72
  )) {}

  const updated = db.prepare(`
    UPDATE alai_hypotheses
    SET status='INVESTIGATING',
        updated_at=?
    WHERE target_name=?
      AND status='OPEN'
  `).run(now, focus.targetName);

  hypothesesUpdated += updated.changes;

  db.prepare(`
    UPDATE alai_world_model_focus
    SET status='MODELED',
        updated_at=?
    WHERE id=?
  `).run(now, focus.id);
}

db.prepare(`
  UPDATE alai_world_model_runs
  SET finished_at=?,
      focus_items_scanned=?,
      concepts_created=?,
      relations_created=?,
      evidence_created=?,
      hypotheses_updated=?,
      status='COMPLETED'
  WHERE id=?
`).run(
  new Date().toISOString(),
  focusItems.length,
  conceptsCreated,
  relationsCreated,
  evidenceCreated,
  hypothesesUpdated,
  runId
);

console.log("ALAI world model builder completed.");
console.log({
  focusItemsScanned: focusItems.length,
  conceptsCreated,
  relationsCreated,
  evidenceCreated,
  hypothesesUpdated,
});

console.table(db.prepare(`
SELECT status, COUNT(*) AS count
FROM alai_world_model_focus
GROUP BY status
`).all());

console.table(db.prepare(`
SELECT status, COUNT(*) AS count
FROM alai_hypotheses
GROUP BY status
`).all());

db.close();

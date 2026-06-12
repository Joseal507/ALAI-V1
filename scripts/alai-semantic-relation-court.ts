import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_semantic_relation_court_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  relations_scanned INTEGER NOT NULL DEFAULT 0,
  relations_kept INTEGER NOT NULL DEFAULT 0,
  relations_weakened INTEGER NOT NULL DEFAULT 0,
  relations_deleted INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'RUNNING'
);

CREATE TABLE IF NOT EXISTS alai_semantic_relation_verdicts (
  id TEXT PRIMARY KEY,
  relation_id TEXT NOT NULL,
  from_concept_id TEXT NOT NULL,
  to_concept_id TEXT NOT NULL,
  from_name TEXT NOT NULL,
  to_name TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  relevance_score REAL NOT NULL,
  verdict TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`);

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const stop = new Set([
  "the","and","for","with","from","into","onto","that","this","what","when","where",
  "que","para","como","con","del","las","los","una","uno","por",
  "education","learning","concept","system","systems","basic","general","principle","principles",
  "object","objects","thing","things","topic","topics","knowledge"
]);

function terms(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter(t => t.length >= 3 && !stop.has(t));
}

function overlap(a: string, b: string): number {
  const A = new Set(terms(a));
  const B = new Set(terms(b));

  if (A.size === 0 || B.size === 0) return 0;

  let shared = 0;
  for (const t of A) if (B.has(t)) shared++;

  return shared / Math.max(1, Math.min(A.size, B.size));
}

function tableExists(name: string): boolean {
  return !!db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name=?
  `).get(name);
}

function count(sql: string, params: any[] = []): number {
  return Number((db.prepare(sql).get(...params) as any)?.n ?? 0);
}

function sharedTopics(a: string, b: string): number {
  if (!tableExists("topic_concepts")) return 0;

  return count(`
    SELECT COUNT(*) AS n
    FROM topic_concepts ta
    JOIN topic_concepts tb ON tb.topic_id=ta.topic_id
    WHERE ta.concept_id=? AND tb.concept_id=?
  `, [a,b]);
}

function sharedEvidence(a: string, b: string): number {
  if (!tableExists("concept_evidence_links")) return 0;

  return count(`
    SELECT COUNT(*) AS n
    FROM concept_evidence_links ea
    JOIN concept_evidence_links eb ON eb.evidence_id=ea.evidence_id
    WHERE ea.concept_id=? AND eb.concept_id=?
  `, [a,b]);
}

function sharedNeighbors(a: string, b: string): number {
  return count(`
    WITH na AS (
      SELECT CASE WHEN from_concept_id=? THEN to_concept_id ELSE from_concept_id END AS x
      FROM relations
      WHERE from_concept_id=? OR to_concept_id=?
    ),
    nb AS (
      SELECT CASE WHEN from_concept_id=? THEN to_concept_id ELSE from_concept_id END AS x
      FROM relations
      WHERE from_concept_id=? OR to_concept_id=?
    )
    SELECT COUNT(*) AS n
    FROM na JOIN nb ON nb.x=na.x
  `, [a,a,a,b,b,b]);
}

function isObviouslyBad(fromName: string, toName: string): boolean {
  const a = normalize(fromName);
  const b = normalize(toName);

  const badPairs = [
    ["cat", "linear algebra"],
    ["cat", "scalar"],
    ["cat", "vector"],
    ["schooling behavior", "artificial general intelligence"],
    ["water utility", "machine learning"],
    ["aquatic locomotion", "machine learning"],
    ["preening", "machine learning"],
    ["adaptive radiation", "machine learning"]
  ];

  return badPairs.some(([x,y]) =>
    (a.includes(x) && b.includes(y)) || (a.includes(y) && b.includes(x))
  );
}

const runId = crypto.randomUUID();

db.prepare(`
INSERT INTO alai_semantic_relation_court_runs (id, started_at, status)
VALUES (?, ?, 'RUNNING')
`).run(runId, now);

const relations = db.prepare(`
SELECT
  r.id,
  r.from_concept_id AS fromId,
  r.to_concept_id AS toId,
  r.relation_type AS relationType,
  c1.name AS fromName,
  c1.status AS fromStatus,
  c2.name AS toName,
  c2.status AS toStatus
FROM relations r
JOIN concepts c1 ON c1.id=r.from_concept_id
JOIN concepts c2 ON c2.id=r.to_concept_id
WHERE c1.status IN ('CANONICAL','VERIFIED','PENDING')
  AND c2.status IN ('CANONICAL','VERIFIED','PENDING')
ORDER BY r.created_at DESC
LIMIT 12000
`).all() as any[];

const deleteRelation = db.prepare(`DELETE FROM relations WHERE id=?`);

let kept = 0;
let weakened = 0;
let deleted = 0;

const insertVerdict = db.prepare(`
INSERT INTO alai_semantic_relation_verdicts
(id, relation_id, from_concept_id, to_concept_id, from_name, to_name, relation_type, relevance_score, verdict, reason, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

for (const r of relations) {
  const lexical = overlap(r.fromName, r.toName);
  const topics = sharedTopics(r.fromId, r.toId);
  const evidence = sharedEvidence(r.fromId, r.toId);
  const neighbors = sharedNeighbors(r.fromId, r.toId);

  let score = 0;

  score += lexical * 0.35;
  score += Math.min(0.25, topics * 0.08);
  score += Math.min(0.25, evidence * 0.1);
  score += Math.min(0.15, neighbors * 0.015);

  if (r.fromStatus === "CANONICAL" && r.toStatus === "CANONICAL") score += 0.08;
  if (["DEPENDS_ON","PART_OF","IS_A","FOUNDATION_FOR","PREREQUISITE_FOR"].includes(r.relationType)) score += 0.08;
  if (r.relationType === "RELATED_TO") score -= 0.07;
  if (isObviouslyBad(r.fromName, r.toName)) score = 0;

  score = Number(Math.max(0, Math.min(1, score)).toFixed(3));

  let verdict = "KEEP";
  let reason = `lexical=${lexical.toFixed(2)} topics=${topics} evidence=${evidence} neighbors=${neighbors}`;

  if (score < 0.08) {
    verdict = "DELETE";
    deleteRelation.run(r.id);
    deleted++;
  } else if (score < 0.18 && r.relationType === "RELATED_TO") {
    verdict = "WEAKEN";
    deleteRelation.run(r.id);
    weakened++;
  } else {
    kept++;
  }

  insertVerdict.run(
    crypto.randomUUID(),
    r.id,
    r.fromId,
    r.toId,
    r.fromName,
    r.toName,
    r.relationType,
    score,
    verdict,
    reason,
    now
  );
}

db.prepare(`
UPDATE alai_semantic_relation_court_runs
SET finished_at=?,
    relations_scanned=?,
    relations_kept=?,
    relations_weakened=?,
    relations_deleted=?,
    status='COMPLETED'
WHERE id=?
`).run(new Date().toISOString(), relations.length, kept, weakened, deleted, runId);

console.log("ALAI semantic relation court completed.");
console.log({ scanned: relations.length, kept, weakened, deleted });

console.table(db.prepare(`
SELECT verdict, COUNT(*) AS count
FROM alai_semantic_relation_verdicts
GROUP BY verdict
ORDER BY count DESC
`).all());

db.close();

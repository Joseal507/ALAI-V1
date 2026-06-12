import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_semantic_truth_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  challenges_scanned INTEGER NOT NULL DEFAULT 0,
  passed INTEGER NOT NULL DEFAULT 0,
  rejected INTEGER NOT NULL DEFAULT 0,
  repaired INTEGER NOT NULL DEFAULT 0,
  flags_created INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'RUNNING'
);

CREATE TABLE IF NOT EXISTS alai_semantic_truth_assessments (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL UNIQUE,
  verdict TEXT NOT NULL,
  semantic_score REAL NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alai_semantic_relation_flags (
  id TEXT PRIMARY KEY,
  relation_id TEXT,
  from_concept_id TEXT,
  to_concept_id TEXT,
  issue_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'MEDIUM',
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);

type Challenge = {
  id: string;
  fromId: string;
  toId: string;
  fromName: string;
  toName: string;
  expectedRelation: string;
  prompt: string;
  score: number;
  status: string;
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_-]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string): Set<string> {
  const stop = new Set([
    "the", "a", "an", "and", "or", "of", "in", "on", "for", "to", "with",
    "by", "from", "as", "is", "are", "was", "were", "basic", "core",
    "concept", "concepts", "system", "systems", "model", "models",
    "learning", "education", "educational", "development", "program",
    "programs", "process", "method", "methods", "strategy", "strategies",
    "strong", "developing", "maintenance", "course", "action",
  ]);

  return new Set(
    normalize(value)
      .split(" ")
      .filter((token) => token.length >= 3 && !stop.has(token))
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;

  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }

  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

function domainHints(value: string): Set<string> {
  const text = normalize(value);
  const out = new Set<string>();

  const groups: [string, string[]][] = [
    ["education", ["education", "teaching", "learning", "preschool", "child", "children", "curriculum", "school", "student", "classroom"]],
    ["animal", ["animal", "bird", "fish", "insect", "farm", "predator", "prey", "breeding", "domestication", "wing", "feather", "tail", "claw"]],
    ["biology", ["organism", "body", "disease", "health", "medicine", "clinical", "diagnosis", "treatment", "vaccination", "dental", "lungs"]],
    ["math", ["algebra", "number", "geometry", "proof", "function", "vector", "integral", "derivative", "complex", "equation"]],
    ["color", ["color", "rgb", "harmony", "contrast", "gradient", "visual"]],
    ["water", ["water", "river", "lake", "sewer", "sanitation", "rainwater", "wastewater", "chlorination"]],
    ["law", ["law", "legal", "rights", "court", "policy", "criminal", "civil"]],
    ["technology", ["algorithm", "data", "computer", "programming", "software", "system", "technology"]],
    ["social", ["social", "society", "culture", "population", "poverty", "bias", "hierarchy"]],
  ];

  for (const [group, words] of groups) {
    if (words.some((word) => text.includes(word))) out.add(group);
  }

  return out;
}

function domainOverlap(a: string, b: string): number {
  const da = domainHints(a);
  const dbb = domainHints(b);

  if (da.size === 0 || dbb.size === 0) return 0.1;

  let overlap = 0;
  for (const item of da) {
    if (dbb.has(item)) overlap++;
  }

  return overlap / Math.max(da.size, dbb.size);
}

function relationQuality(fromName: string, toName: string, relation: string): {
  score: number;
  reason: string;
} {
  const a = normalize(fromName);
  const b = normalize(toName);

  if (!a || !b) return { score: 0, reason: "missing concept name" };

  if (a === b) {
    return { score: 0.15, reason: "self-like duplicated concept relation" };
  }

  const tokenScore = jaccard(tokens(fromName), tokens(toName));
  const domainScore = domainOverlap(fromName, toName);

  let typeScore = 0.4;
  const rel = normalize(relation);

  if (["is a", "part of", "requires", "depends on", "prerequisite for", "used for", "produces", "causes"].some((x) => rel.includes(x))) {
    typeScore = 0.7;
  }

  if (rel.includes("formula")) typeScore = 0.2;
  if (rel.includes("related")) typeScore = 0.35;

  const score = Math.min(1, tokenScore * 0.45 + domainScore * 0.4 + typeScore * 0.15);

  const reason = `tokenScore=${tokenScore.toFixed(3)} domainScore=${domainScore.toFixed(3)} typeScore=${typeScore.toFixed(3)}`;

  return { score: Number(score.toFixed(3)), reason };
}

function flagRelation(challenge: Challenge, reason: string): boolean {
  const relation = db.prepare(`
    SELECT id
    FROM relations
    WHERE from_concept_id=?
      AND to_concept_id=?
      AND relation_type=?
    LIMIT 1
  `).get(challenge.fromId, challenge.toId, challenge.expectedRelation) as { id: string } | undefined;

  const existing = db.prepare(`
    SELECT id
    FROM alai_semantic_relation_flags
    WHERE COALESCE(relation_id,'')=COALESCE(?,'')
      AND from_concept_id=?
      AND to_concept_id=?
      AND status='OPEN'
    LIMIT 1
  `).get(relation?.id ?? null, challenge.fromId, challenge.toId);

  if (existing) return false;

  db.prepare(`
    INSERT INTO alai_semantic_relation_flags (
      id, relation_id, from_concept_id, to_concept_id, issue_type, severity, reason, status, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, 'SEMANTICALLY_WEAK_REASONING_PATH', 'HIGH', ?, 'OPEN', ?, ?)
  `).run(
    crypto.randomUUID(),
    relation?.id ?? null,
    challenge.fromId,
    challenge.toId,
    reason,
    now,
    now
  );

  return true;
}

function demoteWeakDirectRelation(challenge: Challenge, semanticScore: number): boolean {
  const result = db.prepare(`
    UPDATE relations
    SET confidence_score = MIN(confidence_score, ?),
        updated_at = ?
    WHERE from_concept_id=?
      AND to_concept_id=?
      AND relation_type=?
      AND confidence_score > ?
  `).run(
    Math.max(0.2, semanticScore),
    now,
    challenge.fromId,
    challenge.toId,
    challenge.expectedRelation,
    Math.max(0.2, semanticScore)
  );

  return result.changes > 0;
}

const runId = crypto.randomUUID();

db.prepare(`
  INSERT INTO alai_semantic_truth_runs (id, started_at, status)
  VALUES (?, ?, 'RUNNING')
`).run(runId, now);

const challenges = db.prepare(`
SELECT
  ch.id,
  ch.from_concept_id AS fromId,
  ch.to_concept_id AS toId,
  a.name AS fromName,
  b.name AS toName,
  ch.expected_relation AS expectedRelation,
  ch.prompt,
  ch.score,
  ch.status
FROM alai_reasoning_challenges ch
JOIN concepts a ON a.id=ch.from_concept_id
JOIN concepts b ON b.id=ch.to_concept_id
WHERE ch.status IN ('PASSED','FAILED')
ORDER BY ch.updated_at DESC
LIMIT 500
`).all() as Challenge[];

let passed = 0;
let rejected = 0;
let repaired = 0;
let flagsCreated = 0;

for (const challenge of challenges) {
  const assessment = relationQuality(
    challenge.fromName,
    challenge.toName,
    challenge.expectedRelation || "RELATED_TO"
  );

  const verdict =
    assessment.score >= 0.42
      ? "SEMANTICALLY_VALID"
      : "SEMANTICALLY_WEAK";

  db.prepare(`
    INSERT INTO alai_semantic_truth_assessments (
      id, challenge_id, verdict, semantic_score, reason, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(challenge_id) DO UPDATE SET
      verdict=excluded.verdict,
      semantic_score=excluded.semantic_score,
      reason=excluded.reason,
      updated_at=excluded.updated_at
  `).run(
    crypto.randomUUID(),
    challenge.id,
    verdict,
    assessment.score,
    assessment.reason,
    now,
    now
  );

  if (verdict === "SEMANTICALLY_VALID") {
    db.prepare(`
      UPDATE alai_reasoning_challenges
      SET status='SEMANTIC_PASSED',
          score=?,
          answer=answer || ' Semantic truth check passed.',
          updated_at=?
      WHERE id=?
    `).run(assessment.score, now, challenge.id);
    passed++;
  } else {
    db.prepare(`
      UPDATE alai_reasoning_challenges
      SET status='SEMANTIC_REJECTED',
          score=?,
          answer=answer || ' Semantic truth check rejected this reasoning path.',
          updated_at=?
      WHERE id=?
    `).run(assessment.score, now, challenge.id);

    rejected++;

    if (flagRelation(challenge, assessment.reason)) flagsCreated++;
    if (demoteWeakDirectRelation(challenge, assessment.score)) repaired++;
  }
}

db.prepare(`
  UPDATE alai_semantic_truth_runs
  SET finished_at=?,
      challenges_scanned=?,
      passed=?,
      rejected=?,
      repaired=?,
      flags_created=?,
      status='COMPLETED'
  WHERE id=?
`).run(
  new Date().toISOString(),
  challenges.length,
  passed,
  rejected,
  repaired,
  flagsCreated,
  runId
);

console.log("ALAI semantic truth reasoner completed.");
console.log({ challengesScanned: challenges.length, passed, rejected, repaired, flagsCreated });

console.table(db.prepare(`
SELECT verdict, COUNT(*) AS count
FROM alai_semantic_truth_assessments
GROUP BY verdict
`).all());

console.table(db.prepare(`
SELECT status, COUNT(*) AS count
FROM alai_reasoning_challenges
GROUP BY status
`).all());

console.table(db.prepare(`
SELECT reason, COUNT(*) AS count
FROM alai_semantic_relation_flags
WHERE status='OPEN'
GROUP BY reason
ORDER BY count DESC
LIMIT 20
`).all());

db.close();

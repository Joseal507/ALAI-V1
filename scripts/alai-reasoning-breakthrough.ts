import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_reasoning_challenges (
  id TEXT PRIMARY KEY,
  challenge_type TEXT NOT NULL,
  prompt TEXT NOT NULL,
  from_concept_id TEXT,
  to_concept_id TEXT,
  expected_relation TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN',
  score REAL NOT NULL DEFAULT 0,
  answer TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alai_reasoning_breakthrough_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  challenges_created INTEGER NOT NULL DEFAULT 0,
  challenges_solved INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'RUNNING'
);
`);

type RelationRow = {
  fromId: string;
  toId: string;
  fromName: string;
  toName: string;
  relationType: string;
  confidence: number;
};

function challengeExists(fromId: string, toId: string, type: string): boolean {
  const row = db.prepare(`
    SELECT id
    FROM alai_reasoning_challenges
    WHERE from_concept_id=?
      AND to_concept_id=?
      AND expected_relation=?
    LIMIT 1
  `).get(fromId, toId, type);

  return Boolean(row);
}

function createChallenge(row: RelationRow): boolean {
  if (challengeExists(row.fromId, row.toId, row.relationType)) return false;

  const prompt = `Explain how ${row.fromName} relates to ${row.toName} through ${row.relationType}.`;

  db.prepare(`
    INSERT INTO alai_reasoning_challenges (
      id, challenge_type, prompt, from_concept_id, to_concept_id,
      expected_relation, status, score, answer, created_at, updated_at
    )
    VALUES (?, 'GRAPH_RELATION_REASONING', ?, ?, ?, ?, 'OPEN', 0, '', ?, ?)
  `).run(
    crypto.randomUUID(),
    prompt,
    row.fromId,
    row.toId,
    row.relationType,
    now,
    now
  );

  return true;
}

function pathEvidence(fromId: string, toId: string): { paths: number; answer: string } {
  const direct = db.prepare(`
    SELECT
      r.relation_type AS relationType,
      a.name AS fromName,
      b.name AS toName,
      r.confidence_score AS confidence
    FROM relations r
    JOIN concepts a ON a.id=r.from_concept_id
    JOIN concepts b ON b.id=r.to_concept_id
    WHERE r.from_concept_id=?
      AND r.to_concept_id=?
    ORDER BY r.confidence_score DESC
    LIMIT 5
  `).all(fromId, toId) as {
    relationType: string;
    fromName: string;
    toName: string;
    confidence: number;
  }[];

  const twoHop = db.prepare(`
    SELECT
      a.name AS fromName,
      mid.name AS middleName,
      b.name AS toName,
      r1.relation_type AS relationOne,
      r2.relation_type AS relationTwo,
      r1.confidence_score + r2.confidence_score AS score
    FROM relations r1
    JOIN relations r2 ON r2.from_concept_id=r1.to_concept_id
    JOIN concepts a ON a.id=r1.from_concept_id
    JOIN concepts mid ON mid.id=r1.to_concept_id
    JOIN concepts b ON b.id=r2.to_concept_id
    WHERE r1.from_concept_id=?
      AND r2.to_concept_id=?
      AND mid.status!='REJECTED'
    ORDER BY score DESC
    LIMIT 5
  `).all(fromId, toId) as {
    fromName: string;
    middleName: string;
    toName: string;
    relationOne: string;
    relationTwo: string;
    score: number;
  }[];

  const pieces: string[] = [];

  for (const d of direct) {
    pieces.push(`${d.fromName} ${d.relationType} ${d.toName} with confidence ${Number(d.confidence).toFixed(2)}.`);
  }

  for (const p of twoHop) {
    pieces.push(`${p.fromName} connects to ${p.toName} through ${p.middleName}: ${p.relationOne} then ${p.relationTwo}.`);
  }

  return {
    paths: direct.length + twoHop.length,
    answer: pieces.join(" "),
  };
}

const runId = crypto.randomUUID();

db.prepare(`
  INSERT INTO alai_reasoning_breakthrough_runs (id, started_at, status)
  VALUES (?, ?, 'RUNNING')
`).run(runId, now);

const candidateRelations = db.prepare(`
SELECT
  r.from_concept_id AS fromId,
  r.to_concept_id AS toId,
  a.name AS fromName,
  b.name AS toName,
  r.relation_type AS relationType,
  r.confidence_score AS confidence
FROM relations r
JOIN concepts a ON a.id=r.from_concept_id
JOIN concepts b ON b.id=r.to_concept_id
WHERE a.status IN ('VERIFIED','CANONICAL')
  AND b.status IN ('VERIFIED','CANONICAL')
  AND r.confidence_score >= 0.55
ORDER BY r.confidence_score DESC, RANDOM()
LIMIT 120
`).all() as RelationRow[];

let challengesCreated = 0;

for (const row of candidateRelations) {
  if (createChallenge(row)) challengesCreated++;
  if (challengesCreated >= 60) break;
}

const openChallenges = db.prepare(`
SELECT
  id,
  from_concept_id AS fromId,
  to_concept_id AS toId,
  prompt
FROM alai_reasoning_challenges
WHERE status='OPEN'
ORDER BY created_at ASC
LIMIT 120
`).all() as {
  id: string;
  fromId: string;
  toId: string;
  prompt: string;
}[];

let challengesSolved = 0;

for (const challenge of openChallenges) {
  const evidence = pathEvidence(challenge.fromId, challenge.toId);
  const score = Math.min(1, evidence.paths / 3);

  if (score >= 0.34 && evidence.answer.trim()) {
    db.prepare(`
      UPDATE alai_reasoning_challenges
      SET status='PASSED',
          score=?,
          answer=?,
          updated_at=?
      WHERE id=?
    `).run(Number(score.toFixed(3)), evidence.answer, now, challenge.id);

    challengesSolved++;
  } else {
    db.prepare(`
      UPDATE alai_reasoning_challenges
      SET status='FAILED',
          score=?,
          answer=?,
          updated_at=?
      WHERE id=?
    `).run(Number(score.toFixed(3)), evidence.answer || "No sufficient reasoning path found.", now, challenge.id);
  }
}

db.prepare(`
  UPDATE alai_reasoning_breakthrough_runs
  SET finished_at=?,
      challenges_created=?,
      challenges_solved=?,
      status='COMPLETED'
  WHERE id=?
`).run(new Date().toISOString(), challengesCreated, challengesSolved, runId);

console.log("ALAI reasoning breakthrough completed.");
console.log({ challengesCreated, challengesSolved });

console.table(db.prepare(`
SELECT status, COUNT(*) AS count
FROM alai_reasoning_challenges
GROUP BY status
`).all());

console.table(db.prepare(`
SELECT prompt, score, status
FROM alai_reasoning_challenges
ORDER BY updated_at DESC
LIMIT 20
`).all());

db.close();

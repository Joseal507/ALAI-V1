import Database from "better-sqlite3";
import { getActiveLearningDomain } from "../src/learning/education-progression";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_expansion_gate (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL UNIQUE,
  allowed INTEGER NOT NULL DEFAULT 0,
  gate_score REAL NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (topic_id) REFERENCES curriculum_topics(id)
);
`);

const activeDomain = getActiveLearningDomain(db);

const rows = db.prepare(`
  SELECT
    t.id,
    t.name,
    d.name AS domainName,
    COALESCE(tr.rollup_coverage_score, 0) AS rollup,
    COALESCE(cc.coverage_score, 0) AS directCoverage,
    COALESCE(cc.concepts_mastered, 0) AS mastered,
    COALESCE(cc.concepts_total, 0) AS total
  FROM curriculum_topics t
  JOIN academic_domains d ON d.id = t.domain_id
  LEFT JOIN topic_coverage_rollup tr ON tr.topic_id = t.id
  LEFT JOIN curriculum_coverage cc ON cc.topic_id = t.id
`).all() as {
  id: string;
  name: string;
  domainName: string;
  rollup: number;
  directCoverage: number;
  mastered: number;
  total: number;
}[];

const upsert = db.prepare(`
  INSERT INTO alai_expansion_gate (
    id, topic_id, allowed, gate_score, reason, created_at, updated_at
  )
  VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?)
  ON CONFLICT(topic_id) DO UPDATE SET
    allowed = excluded.allowed,
    gate_score = excluded.gate_score,
    reason = excluded.reason,
    updated_at = excluded.updated_at
`);

let allowed = 0;
let blocked = 0;

for (const row of rows) {
  const masteryRatio = row.total === 0 ? 0 : row.mastered / row.total;
  const gateScore = Math.max(row.rollup, row.directCoverage, masteryRatio);
  const isActiveDomain = row.domainName === activeDomain.domainName;
  const canExpand = isActiveDomain && gateScore >= 0.75;

  upsert.run(
    row.id,
    canExpand ? 1 : 0,
    Number(gateScore.toFixed(3)),
    canExpand
      ? `Expansion allowed: ${row.name} is mastered inside active domain ${activeDomain.domainName}.`
      : !isActiveDomain
        ? `Expansion blocked: ${row.name} belongs to ${row.domainName}, but active domain is ${activeDomain.domainName}.`
        : `Expansion blocked: ${row.name} needs stronger mastery before creating deeper branches.`,
    now,
    now
  );

  if (canExpand) allowed++;
  else blocked++;
}

console.log("ALAI expansion gatekeeper completed.");
console.log({
  activeDomain: activeDomain.domainName,
  reason: activeDomain.reason,
  allowed,
  blocked,
});

console.table(db.prepare(`
  SELECT
    t.name AS topic,
    g.allowed,
    g.gate_score AS gateScore,
    g.reason
  FROM alai_expansion_gate g
  JOIN curriculum_topics t ON t.id = g.topic_id
  ORDER BY g.gate_score DESC, t.name ASC
  LIMIT 25
`).all());

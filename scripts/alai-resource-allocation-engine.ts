import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_resource_allocations (
  id TEXT PRIMARY KEY,
  area TEXT NOT NULL UNIQUE,
  allocation_score REAL NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);

const rows = db.prepare(`
  SELECT
    d.name,
    cc.effective_coverage_score AS effective,
    cc.completion_score AS completion,
    cc.total_topics AS totalTopics,
    cc.mapped_topics AS mappedTopics,
    cc.mapped_concepts AS mappedConcepts
  FROM curriculum_completion cc
  JOIN academic_domains d ON d.id = cc.domain_id
  WHERE d.name != 'ALAI Metacognition'
    AND cc.total_topics > 0
  ORDER BY cc.effective_coverage_score ASC
`).all() as {
  name: string;
  effective: number;
  completion: number;
  totalTopics: number;
  mappedTopics: number;
  mappedConcepts: number;
}[];

const scored = rows.map((row) => {
  const weakness = 1 - Math.min(1, row.effective);
  const topicGap = row.totalTopics === 0 ? 0 : 1 - Math.min(1, row.mappedTopics / row.totalTopics);
  const conceptScarcity = row.mappedConcepts < 3 ? 0.25 : 0;

  const score = weakness * 0.65 + topicGap * 0.25 + conceptScarcity;

  return {
    area: row.name,
    raw: Math.max(0.01, score),
    reason: `effective=${row.effective}, completion=${row.completion}, mappedTopics=${row.mappedTopics}/${row.totalTopics}, mappedConcepts=${row.mappedConcepts}`,
  };
});

const top = scored.sort((a, b) => b.raw - a.raw).slice(0, 8);
const total = top.reduce((sum, item) => sum + item.raw, 0) || 1;

const upsert = db.prepare(`
  INSERT INTO alai_resource_allocations (
    id, area, allocation_score, reason, created_at, updated_at
  )
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(area) DO UPDATE SET
    allocation_score = excluded.allocation_score,
    reason = excluded.reason,
    updated_at = excluded.updated_at
`);

for (const item of top) {
  upsert.run(
    crypto.randomUUID(),
    item.area,
    Number((item.raw / total).toFixed(3)),
    item.reason,
    now,
    now
  );
}

console.log("ALAI resource allocation completed.");
console.table(db.prepare(`
  SELECT area, allocation_score AS allocation, reason
  FROM alai_resource_allocations
  ORDER BY allocation_score DESC
`).all());

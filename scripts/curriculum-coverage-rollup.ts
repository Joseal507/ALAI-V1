import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS topic_coverage_rollup (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL UNIQUE,
  direct_coverage_score REAL NOT NULL DEFAULT 0,
  rollup_coverage_score REAL NOT NULL DEFAULT 0,
  child_topics_count INTEGER NOT NULL DEFAULT 0,
  descendant_topics_count INTEGER NOT NULL DEFAULT 0,
  concepts_total INTEGER NOT NULL DEFAULT 0,
  concepts_mastered INTEGER NOT NULL DEFAULT 0,
  last_calculated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (topic_id) REFERENCES curriculum_topics(id)
);

CREATE TABLE IF NOT EXISTS domain_coverage_rollup (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL UNIQUE,
  rollup_coverage_score REAL NOT NULL DEFAULT 0,
  child_domains_count INTEGER NOT NULL DEFAULT 0,
  topics_count INTEGER NOT NULL DEFAULT 0,
  concepts_total INTEGER NOT NULL DEFAULT 0,
  concepts_mastered INTEGER NOT NULL DEFAULT 0,
  last_calculated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (domain_id) REFERENCES academic_domains(id)
);
`);

type Topic = {
  id: string;
  parent_topic_id: string | null;
};

const topics = db.prepare(`
  SELECT id, parent_topic_id
  FROM curriculum_topics
`).all() as Topic[];

const coverageRows = db.prepare(`
  SELECT topic_id, coverage_score, concepts_total, concepts_mastered
  FROM curriculum_coverage
`).all() as {
  topic_id: string;
  coverage_score: number;
  concepts_total: number;
  concepts_mastered: number;
}[];

const coverageByTopic = new Map(coverageRows.map((row) => [row.topic_id, row]));
const childrenByTopic = new Map<string, Topic[]>();

for (const topic of topics) {
  if (!topic.parent_topic_id) continue;
  const children = childrenByTopic.get(topic.parent_topic_id) ?? [];
  children.push(topic);
  childrenByTopic.set(topic.parent_topic_id, children);
}

function descendantsOf(topicId: string): Topic[] {
  const children = childrenByTopic.get(topicId) ?? [];
  return children.flatMap((child) => [child, ...descendantsOf(child.id)]);
}

const upsertTopic = db.prepare(`
  INSERT INTO topic_coverage_rollup (
    id, topic_id, direct_coverage_score, rollup_coverage_score,
    child_topics_count, descendant_topics_count,
    concepts_total, concepts_mastered,
    last_calculated_at, created_at, updated_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(topic_id) DO UPDATE SET
    direct_coverage_score = excluded.direct_coverage_score,
    rollup_coverage_score = excluded.rollup_coverage_score,
    child_topics_count = excluded.child_topics_count,
    descendant_topics_count = excluded.descendant_topics_count,
    concepts_total = excluded.concepts_total,
    concepts_mastered = excluded.concepts_mastered,
    last_calculated_at = excluded.last_calculated_at,
    updated_at = excluded.updated_at
`);

for (const topic of topics) {
  const descendants = descendantsOf(topic.id);
  const ids = [topic.id, ...descendants.map((child) => child.id)];

  const rows = ids
    .map((id) => coverageByTopic.get(id))
    .filter(Boolean) as {
      coverage_score: number;
      concepts_total: number;
      concepts_mastered: number;
    }[];

  const totalConcepts = rows.reduce((sum, row) => sum + row.concepts_total, 0);
  const totalMastered = rows.reduce((sum, row) => sum + row.concepts_mastered, 0);

  const rollup =
    totalConcepts === 0
      ? 0
      : rows.reduce((sum, row) => sum + row.coverage_score * row.concepts_total, 0) /
        totalConcepts;

  upsertTopic.run(
    crypto.randomUUID(),
    topic.id,
    coverageByTopic.get(topic.id)?.coverage_score ?? 0,
    Number(rollup.toFixed(3)),
    (childrenByTopic.get(topic.id) ?? []).length,
    descendants.length,
    totalConcepts,
    totalMastered,
    now,
    now,
    now
  );
}

type Domain = {
  id: string;
  parent_domain_id: string | null;
};

const domains = db.prepare(`
  SELECT id, parent_domain_id
  FROM academic_domains
`).all() as Domain[];

const domainChildren = new Map<string, Domain[]>();

for (const domain of domains) {
  if (!domain.parent_domain_id) continue;
  const children = domainChildren.get(domain.parent_domain_id) ?? [];
  children.push(domain);
  domainChildren.set(domain.parent_domain_id, children);
}

function domainDescendantsOf(domainId: string): Domain[] {
  const children = domainChildren.get(domainId) ?? [];
  return children.flatMap((child) => [child, ...domainDescendantsOf(child.id)]);
}

const topicRowsByDomain = db.prepare(`
  SELECT
    t.domain_id AS domain_id,
    tr.rollup_coverage_score AS rollup_coverage_score,
    tr.concepts_total AS concepts_total,
    tr.concepts_mastered AS concepts_mastered
  FROM curriculum_topics t
  JOIN topic_coverage_rollup tr ON tr.topic_id = t.id
  WHERE t.domain_id IS NOT NULL
`).all() as {
  domain_id: string;
  rollup_coverage_score: number;
  concepts_total: number;
  concepts_mastered: number;
}[];

const upsertDomain = db.prepare(`
  INSERT INTO domain_coverage_rollup (
    id, domain_id, rollup_coverage_score, child_domains_count,
    topics_count, concepts_total, concepts_mastered,
    last_calculated_at, created_at, updated_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(domain_id) DO UPDATE SET
    rollup_coverage_score = excluded.rollup_coverage_score,
    child_domains_count = excluded.child_domains_count,
    topics_count = excluded.topics_count,
    concepts_total = excluded.concepts_total,
    concepts_mastered = excluded.concepts_mastered,
    last_calculated_at = excluded.last_calculated_at,
    updated_at = excluded.updated_at
`);

for (const domain of domains) {
  const domainIds = [
    domain.id,
    ...domainDescendantsOf(domain.id).map((child) => child.id),
  ];

  const rows = topicRowsByDomain.filter((row) => domainIds.includes(row.domain_id));

  const totalConcepts = rows.reduce((sum, row) => sum + row.concepts_total, 0);
  const totalMastered = rows.reduce((sum, row) => sum + row.concepts_mastered, 0);

  const rollup =
    totalConcepts === 0
      ? 0
      : rows.reduce((sum, row) => sum + row.rollup_coverage_score * row.concepts_total, 0) /
        totalConcepts;

  upsertDomain.run(
    crypto.randomUUID(),
    domain.id,
    Number(rollup.toFixed(3)),
    (domainChildren.get(domain.id) ?? []).length,
    rows.length,
    totalConcepts,
    totalMastered,
    now,
    now,
    now
  );
}

console.log("Curriculum coverage rollup updated.");
console.log({
  topicRollups: topics.length,
  domainRollups: domains.length,
});

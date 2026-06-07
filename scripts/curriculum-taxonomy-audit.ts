import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS curriculum_taxonomy_audit (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  issue_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  description TEXT NOT NULL,
  recommended_action TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS curriculum_taxonomy_rules (
  id TEXT PRIMARY KEY,
  rule_name TEXT NOT NULL UNIQUE,
  rule_type TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
`);

db.prepare(`
  DELETE FROM curriculum_taxonomy_audit
  WHERE resolved_at IS NULL
`).run();

const rules = [
  ["TOPIC_NAME_MUST_NOT_MATCH_OWN_DOMAIN_NAME", "COLLISION"],
  ["ROOT_TOPIC_WITH_DOMAIN_SHOULD_BE_REVIEWED", "STRUCTURE"],
  ["TOPIC_WITH_NULL_DOMAIN_SHOULD_BE_EDUCATION_LEVEL_ONLY", "STRUCTURE"],
  ["ALGEBRA_SPECIALIZATION_AS_DOMAIN_AND_TOPIC_COLLISION", "NORMALIZATION"],
];

for (const [ruleName, ruleType] of rules) {
  db.prepare(`
    INSERT INTO curriculum_taxonomy_rules (id, rule_name, rule_type, enabled, created_at)
    VALUES (?, ?, ?, 1, ?)
    ON CONFLICT(rule_name) DO NOTHING
  `).run(crypto.randomUUID(), ruleName, ruleType, now);
}

function audit(input: {
  entityType: string;
  entityId: string;
  issueType: string;
  severity: string;
  description: string;
  recommendedAction: string;
}) {
  db.prepare(`
    INSERT INTO curriculum_taxonomy_audit (
      id, entity_type, entity_id, issue_type, severity,
      description, recommended_action, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    input.entityType,
    input.entityId,
    input.issueType,
    input.severity,
    input.description,
    input.recommendedAction,
    now
  );
}

const domainTopicCollisions = db.prepare(`
  SELECT
    t.id AS topic_id,
    t.name AS topic_name,
    d.id AS domain_id,
    d.name AS domain_name,
    parent.name AS parent_domain_name
  FROM curriculum_topics t
  JOIN academic_domains d ON d.id = t.domain_id
  LEFT JOIN academic_domains parent ON parent.id = d.parent_domain_id
  WHERE lower(t.name) = lower(d.name)
`).all() as {
  topic_id: string;
  topic_name: string;
  domain_id: string;
  domain_name: string;
  parent_domain_name: string | null;
}[];

for (const row of domainTopicCollisions) {
  audit({
    entityType: "curriculum_topic",
    entityId: row.topic_id,
    issueType: "DOMAIN_TOPIC_NAME_COLLISION",
    severity: "HIGH",
    description: `Topic "${row.topic_name}" has the same name as its assigned domain "${row.domain_name}".`,
    recommendedAction: `Review whether "${row.topic_name}" should be a topic under "${row.parent_domain_name ?? "its parent domain"}" instead of having a same-name domain.`,
  });
}

const rootTopicsWithDomains = db.prepare(`
  SELECT
    t.id AS topic_id,
    t.name AS topic_name,
    d.name AS domain_name
  FROM curriculum_topics t
  JOIN academic_domains d ON d.id = t.domain_id
  WHERE t.parent_topic_id IS NULL
`).all() as {
  topic_id: string;
  topic_name: string;
  domain_name: string;
}[];

for (const row of rootTopicsWithDomains) {
  audit({
    entityType: "curriculum_topic",
    entityId: row.topic_id,
    issueType: "ROOT_TOPIC_WITH_DOMAIN",
    severity: "MEDIUM",
    description: `Root topic "${row.topic_name}" is attached directly to domain "${row.domain_name}".`,
    recommendedAction: `Decide if "${row.topic_name}" should remain a root curriculum topic or become a child topic under a broader topic.`,
  });
}

const nullDomainTopics = db.prepare(`
  SELECT id, name
  FROM curriculum_topics
  WHERE domain_id IS NULL
`).all() as {
  id: string;
  name: string;
}[];

for (const row of nullDomainTopics) {
  audit({
    entityType: "curriculum_topic",
    entityId: row.id,
    issueType: "TOPIC_WITH_NULL_DOMAIN",
    severity: row.name.includes("Education") ? "LOW" : "MEDIUM",
    description: `Topic "${row.name}" has no academic domain.`,
    recommendedAction: `If "${row.name}" is an education level, it should probably live only in education_levels, not curriculum_topics.`,
  });
}

const algebraDomain = db.prepare(`
  SELECT id FROM academic_domains WHERE name = 'Algebra' LIMIT 1
`).get() as { id: string } | undefined;

if (algebraDomain) {
  const algebraSpecializationTopics = db.prepare(`
    SELECT
      t.id AS topic_id,
      t.name AS topic_name,
      t.domain_id AS topic_domain_id,
      d.name AS assigned_domain_name
    FROM curriculum_topics t
    JOIN academic_domains d ON d.id = t.domain_id
    WHERE t.name IN ('Abstract Algebra', 'Elementary Algebra', 'Linear Algebra')
  `).all() as {
    topic_id: string;
    topic_name: string;
    topic_domain_id: string;
    assigned_domain_name: string;
  }[];

  for (const row of algebraSpecializationTopics) {
    if (row.topic_domain_id !== algebraDomain.id) {
      audit({
        entityType: "curriculum_topic",
        entityId: row.topic_id,
        issueType: "ALGEBRA_SPECIALIZATION_MISPLACED",
        severity: "HIGH",
        description: `Topic "${row.topic_name}" is assigned to domain "${row.assigned_domain_name}" instead of the broader "Algebra" domain.`,
        recommendedAction: `Move topic "${row.topic_name}" to domain "Algebra" and consider removing or demoting the same-name domain if it is only acting as a duplicate container.`,
      });
    }
  }
}

console.log("Curriculum taxonomy audit completed.");

const summary = db.prepare(`
  SELECT issue_type AS issueType, severity, COUNT(*) AS count
  FROM curriculum_taxonomy_audit
  WHERE resolved_at IS NULL
  GROUP BY issue_type, severity
  ORDER BY
    CASE severity
      WHEN 'HIGH' THEN 1
      WHEN 'MEDIUM' THEN 2
      WHEN 'LOW' THEN 3
      ELSE 4
    END,
    issue_type ASC
`).all();

console.table(summary);

const issues = db.prepare(`
  SELECT
    issue_type AS issueType,
    severity,
    description,
    recommended_action AS recommendedAction
  FROM curriculum_taxonomy_audit
  WHERE resolved_at IS NULL
  ORDER BY
    CASE severity
      WHEN 'HIGH' THEN 1
      WHEN 'MEDIUM' THEN 2
      WHEN 'LOW' THEN 3
      ELSE 4
    END,
    issue_type ASC,
    description ASC
`).all();

console.table(issues);

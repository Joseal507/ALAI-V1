import Database from "better-sqlite3";
import crypto from "node:crypto";
import { getActiveLearningDomain } from "../src/learning/education-progression";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

const active = getActiveLearningDomain(db);

function sequenceRank(topicName: string) {
  const name = topicName.toLowerCase();

  if (name.includes("elementary algebra")) return 1;
  if (name.includes("linear equations")) return 2;
  if (name.includes("algebraic manipulation")) return 3;
  if (name.includes("coordinate geometry")) return 4;
  if (name.includes("graphing linear equations")) return 5;
  if (name.includes("slope-intercept")) return 6;
  if (name.includes("standard form")) return 7;
  if (name.includes("systems of linear equations")) return 8;
  if (name.includes("linear inequalities")) return 9;
  if (name.includes("quadratic")) return 10;

  if (name.includes("linear algebra")) return 50;
  if (name.includes("vector spaces")) return 60;
  if (name.includes("abstract algebra")) return 70;
  if (name.includes("group theory")) return 80;
  if (name.includes("ring theory")) return 90;

  return 20;
}

function prerequisitesPassed(topicId: string) {
  const row = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(
        CASE
          WHEN COALESCE(tr.rollup_coverage_score, 0) >= 0.82 THEN 1
          ELSE 0
        END
      ) AS passed
    FROM topic_prerequisites tp
    LEFT JOIN topic_coverage_rollup tr
      ON tr.topic_id = tp.prerequisite_topic_id
    WHERE tp.topic_id = ?
  `).get(topicId) as { total: number; passed: number | null };

  const total = row.total ?? 0;
  const passed = row.passed ?? 0;

  return {
    total,
    passed,
    ok: total === 0 || passed >= total,
  };
}

const topics = db.prepare(`
  SELECT
    t.id,
    t.name,
    t.depth,
    COALESCE(tr.rollup_coverage_score, 0) AS coverage,
    COUNT(tc.concept_id) AS conceptCount
  FROM curriculum_topics t
  JOIN academic_domains d ON d.id = t.domain_id
  LEFT JOIN topic_concepts tc ON tc.topic_id = t.id
  LEFT JOIN topic_coverage_rollup tr ON tr.topic_id = t.id
  WHERE d.name = ?
  GROUP BY t.id
`).all(active.domainName) as {
  id: string;
  name: string;
  depth: number;
  coverage: number;
  conceptCount: number;
}[];

let created = 0;
let reopened = 0;
let skipped = 0;
let blockedByPrerequisites = 0;
let blockedBySequence = 0;

for (const topic of topics) {
  const rank = sequenceRank(topic.name);
  const prereq = prerequisitesPassed(topic.id);

  if (!prereq.ok) {
    blockedByPrerequisites++;
    continue;
  }

  if (active.domainName === "Algebra" && rank >= 50 && active.effectiveCoverage < 0.72) {
    const existing = db.prepare(`
      SELECT id
      FROM alai_learning_objectives
      WHERE topic_id = ?
      LIMIT 1
    `).get(topic.id) as { id: string } | undefined;

    if (existing) {
      db.prepare(`
        UPDATE alai_learning_objectives
        SET status = 'BLOCKED',
            updated_at = ?
        WHERE id = ?
      `).run(now, existing.id);
    }

    blockedBySequence++;
    continue;
  }

  const title = `Learn ${topic.name}`;

  const existing = db.prepare(`
    SELECT id, status
    FROM alai_learning_objectives
    WHERE topic_id = ?
      AND title = ?
    LIMIT 1
  `).get(topic.id, title) as { id: string; status: string } | undefined;

  const priority = Math.max(
    0.05,
    Math.min(
      0.99,
      1 - rank / 100 - Math.min(0.3, topic.coverage * 0.3)
    )
  );

  if (existing) {
    if (existing.status === "BLOCKED") {
      db.prepare(`
        UPDATE alai_learning_objectives
        SET status = 'OPEN',
            priority_score = ?,
            updated_at = ?
        WHERE id = ?
      `).run(priority, now, existing.id);
      reopened++;
    } else {
      db.prepare(`
        UPDATE alai_learning_objectives
        SET priority_score = ?,
            updated_at = ?
        WHERE id = ?
      `).run(priority, now, existing.id);
      skipped++;
    }
    continue;
  }

  db.prepare(`
    INSERT INTO alai_learning_objectives (
      id,
      topic_id,
      title,
      objective_type,
      status,
      priority_score,
      mastery_target,
      attempts,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    topic.id,
    title,
    "ACTIVE_DOMAIN_LEARNING",
    "OPEN",
    priority,
    0.82,
    0,
    now,
    now
  );

  created++;
}

console.log("ALAI active-domain objective seeder completed.");
console.log({
  activeDomain: active.domainName,
  reason: active.reason,
  topics: topics.length,
  created,
  reopened,
  skipped,
  blockedByPrerequisites,
  blockedBySequence,
});

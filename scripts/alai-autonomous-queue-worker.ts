import Database from "better-sqlite3";
import crypto from "node:crypto";
import { researchWeb } from "../src/research/research-engine";
import { learnKnowledgeFromEvidenceText } from "../src/autonomy/autonomous-knowledge-learner";
import { getActiveLearningDomain } from "../src/learning/education-progression";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

function buildQuery(topic: string, domain: string, attempts: number) {
  const variants = [
    "lesson examples practice",
    "student guide examples",
    "introduction concepts examples",
    "curriculum standards examples",
    "worked examples explanation",
  ];

  const variant = variants[attempts % variants.length];

  if (domain === "Foundational Learning") return `${topic} preschool early childhood education basics ${variant}`;
  if (domain === "Primary Foundations") return `${topic} elementary school basics ${variant}`;
  if (domain === "Algebra") return `${topic} pre algebra algebra 1 basics ${variant}`;
  return `${topic} school curriculum basics ${variant}`;
}

function sequenceRank(topicName: string) {
  const name = topicName.toLowerCase();

  if (name.includes("elementary algebra")) return 1;
  if (name.includes("linear equations")) return 2;
  if (name.includes("algebraic manipulation")) return 3;
  if (name.includes("coordinate geometry")) return 4;
  if (name.includes("graphing linear equations")) return 5;
  if (name.includes("slope-intercept")) return 6;
  if (name.includes("standard form")) return 7;
  if (name.includes("linear algebra")) return 20;
  if (name.includes("vector spaces")) return 25;
  if (name.includes("abstract algebra")) return 30;
  if (name.includes("group theory")) return 40;

  return 10;
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

async function main() {
  console.log("\n=== ALAI Autonomous Queue Worker ===");

  const active = getActiveLearningDomain(db);

  const candidates = db.prepare(`
    SELECT
      o.id,
      o.title,
      o.attempts,
      o.priority_score,
      o.mastery_target,
      t.id AS topicId,
      t.name AS topicName,
      t.depth,
      d.name AS domainName,
      COALESCE(tr.rollup_coverage_score, 0) AS coverage
    FROM alai_learning_objectives o
    JOIN curriculum_topics t ON t.id = o.topic_id
    JOIN academic_domains d ON d.id = t.domain_id
    LEFT JOIN topic_coverage_rollup tr ON tr.topic_id = t.id
    WHERE o.status IN ('OPEN', 'IN_PROGRESS')
      AND d.name = ?
    ORDER BY
      t.depth ASC,
      o.priority_score DESC,
      o.attempts ASC,
      o.updated_at ASC
  `).all(active.domainName) as {
    id: string;
    title: string;
    attempts: number;
    priority_score: number;
    mastery_target: number;
    topicId: string;
    topicName: string;
    depth: number;
    domainName: string;
    coverage: number;
  }[];

  const eligible = candidates
    .map((candidate) => ({
      ...candidate,
      prereq: prerequisitesPassed(candidate.topicId),
      rank: sequenceRank(candidate.topicName),
    }))
    .filter((candidate) => candidate.prereq.ok)
    .filter((candidate) => candidate.coverage < candidate.mastery_target)
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      if (a.depth !== b.depth) return a.depth - b.depth;
      if (a.coverage !== b.coverage) return a.coverage - b.coverage;
      if (a.priority_score !== b.priority_score) return b.priority_score - a.priority_score;
      return a.attempts - b.attempts;
    });

  const objective = eligible[0];

  if (!objective) {
    console.log("No eligible objective found for active domain.");
    console.log({
      active,
      candidates: candidates.length,
      blockedByPrerequisites: candidates.filter((c) => !prerequisitesPassed(c.topicId).ok).length,
    });
    return;
  }

  const query = buildQuery(objective.topicName, objective.domainName, objective.attempts);

  console.log({
    activeDomain: active.domainName,
    objective: objective.title,
    topic: objective.topicName,
    sequenceRank: objective.rank,
    coverage: objective.coverage,
    prerequisites: objective.prereq,
    query,
  });

  db.prepare(`
    UPDATE alai_learning_objectives
    SET status = 'IN_PROGRESS',
        attempts = attempts + 1,
        updated_at = ?
    WHERE id = ?
  `).run(now, objective.id);

  const research = await researchWeb(query);

  let insertedEvidence = 0;
  let skippedEvidence = 0;

  for (const source of research.sources.slice(0, 8)) {
    const existing = db.prepare(`
      SELECT id FROM evidence
      WHERE source_url = ?
      LIMIT 1
    `).get(source.url) as { id: string } | undefined;

    if (existing) {
      skippedEvidence++;
      continue;
    }

    db.prepare(`
      INSERT INTO evidence (
        id,
        source_type,
        source_name,
        source_url,
        content_summary,
        reliability_score,
        captured_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      "WEBSITE",
      source.title,
      source.url,
      source.snippet,
      0.6,
      now
    );

    insertedEvidence++;
  }

  const learningText = research.sources
    .slice(0, 8)
    .map((source) => `${source.title}\n${source.snippet}`)
    .join("\n\n");

  const learned = await learnKnowledgeFromEvidenceText(db, learningText);

  const currentCoverage = db.prepare(`
    SELECT COALESCE(rollup_coverage_score, 0) AS coverage
    FROM topic_coverage_rollup
    WHERE topic_id = ?
  `).get(objective.topicId) as { coverage: number } | undefined;

  if ((currentCoverage?.coverage ?? objective.coverage) >= objective.mastery_target) {
    db.prepare(`
      UPDATE alai_learning_objectives
      SET status = 'COMPLETED',
          updated_at = ?
      WHERE id = ?
    `).run(now, objective.id);
  } else {
    db.prepare(`
      UPDATE alai_learning_objectives
      SET status = 'OPEN',
          updated_at = ?
      WHERE id = ?
    `).run(now, objective.id);
  }

  console.log("Queue worker completed.");
  console.log({
    insertedEvidence,
    skippedEvidence,
    learned,
    previousCoverage: objective.coverage,
    currentCoverage: currentCoverage?.coverage ?? null,
  });
}

main().catch((error) => {
  console.error("ALAI autonomous queue worker failed:");
  console.error(error);
  process.exit(1);
});

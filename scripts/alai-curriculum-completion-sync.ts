import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

type DomainRow = {
  id: string;
  name: string;
};

const domains = db.prepare(`
  SELECT id, name
  FROM academic_domains
`).all() as DomainRow[];

let updated = 0;

for (const domain of domains) {
  const stats = db.prepare(`
    SELECT
      COUNT(DISTINCT t.id) AS totalTopics,
      COUNT(DISTINCT CASE
        WHEN topicMastery.avgMastery >= 0.68 THEN t.id
      END) AS strongTopics,
      COUNT(DISTINCT tc.concept_id) AS mappedConcepts,
      COALESCE(AVG(topicMastery.avgMastery), 0) AS avgMastery
    FROM curriculum_topics t
    LEFT JOIN topic_concepts tc ON tc.topic_id = t.id
    LEFT JOIN (
      SELECT
        tc.topic_id,
        AVG(COALESCE(cm.mastery_score, 0)) AS avgMastery
      FROM topic_concepts tc
      LEFT JOIN concept_mastery cm ON cm.concept_id = tc.concept_id
      GROUP BY tc.topic_id
    ) topicMastery ON topicMastery.topic_id = t.id
    WHERE t.domain_id = ?
  `).get(domain.id) as {
    totalTopics: number;
    strongTopics: number;
    mappedConcepts: number;
    avgMastery: number;
  };

  const mappedTopics = db.prepare(`
    SELECT COUNT(*) AS count
    FROM (
      SELECT t.id
      FROM curriculum_topics t
      JOIN topic_concepts tc ON tc.topic_id = t.id
      WHERE t.domain_id = ?
      GROUP BY t.id
      HAVING COUNT(tc.concept_id) > 0
    )
  `).get(domain.id) as { count: number };

  const completionScore =
    stats.totalTopics === 0 ? 0 : stats.strongTopics / stats.totalTopics;

  const knownCoverageScore =
    stats.totalTopics === 0 ? 0 : mappedTopics.count / stats.totalTopics;

  const effectiveCoverageScore = Math.min(
    1,
    completionScore * 0.55 + stats.avgMastery * 0.45
  );

  db.prepare(`
    INSERT INTO curriculum_completion (
      id,
      domain_id,
      mapped_child_domains,
      total_child_domains,
      mapped_topics,
      total_topics,
      mapped_concepts,
      completion_score,
      known_coverage_score,
      effective_coverage_score,
      last_calculated_at,
      created_at,
      updated_at,
      mastered_topics
    )
    VALUES (?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(domain_id) DO UPDATE SET
      mapped_topics = excluded.mapped_topics,
      total_topics = excluded.total_topics,
      mapped_concepts = excluded.mapped_concepts,
      completion_score = excluded.completion_score,
      known_coverage_score = excluded.known_coverage_score,
      effective_coverage_score = excluded.effective_coverage_score,
      last_calculated_at = excluded.last_calculated_at,
      updated_at = excluded.updated_at,
      mastered_topics = excluded.mastered_topics
  `).run(
    crypto.randomUUID(),
    domain.id,
    mappedTopics.count,
    stats.totalTopics,
    stats.mappedConcepts,
    Number(completionScore.toFixed(3)),
    Number(knownCoverageScore.toFixed(3)),
    Number(effectiveCoverageScore.toFixed(3)),
    now,
    now,
    now,
    stats.strongTopics
  );

  updated++;
}

console.log("ALAI curriculum completion sync completed.");
console.log({ updated });

console.table(db.prepare(`
  SELECT
    d.name,
    cc.mastered_topics AS masteredTopics,
    cc.mapped_topics AS mappedTopics,
    cc.total_topics AS totalTopics,
    cc.mapped_concepts AS mappedConcepts,
    cc.completion_score AS completion,
    cc.known_coverage_score AS known,
    cc.effective_coverage_score AS effective
  FROM curriculum_completion cc
  JOIN academic_domains d ON d.id = cc.domain_id
  ORDER BY cc.effective_coverage_score DESC, d.name ASC
`).all());

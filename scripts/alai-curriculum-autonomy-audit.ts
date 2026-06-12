import Database from "better-sqlite3";

const db = new Database("data/alai.db");

const snapshot = db.prepare(`
SELECT
  (SELECT COUNT(*) FROM academic_domains) AS domains,
  (SELECT COUNT(*) FROM curriculum_topics) AS topics,
  (SELECT COUNT(*) FROM topic_concepts) AS topicConcepts,
  (SELECT COUNT(*) FROM topic_prerequisites) AS topicPrerequisites,
  (SELECT COUNT(*) FROM curriculum_completion) AS completionRows,
  (SELECT COUNT(*) FROM topic_coverage_rollup) AS topicRollups,
  (SELECT COUNT(*) FROM domain_coverage_rollup) AS domainRollups,
  (SELECT COUNT(*) FROM alai_curriculum_autonomy_runs) AS directorRuns,
  (SELECT COUNT(*) FROM alai_quality_flags WHERE status='OPEN') AS openFlags,
  (
    SELECT COUNT(*)
    FROM curriculum_topics t
    LEFT JOIN topic_concepts tc ON tc.topic_id=t.id
    GROUP BY NULL
  ) AS totalCheck
`).get() as any;

const weak = db.prepare(`
SELECT
  SUM(CASE WHEN concept_count=0 THEN 1 ELSE 0 END) AS topicsWithoutConcepts,
  SUM(CASE WHEN prereq_count=0 THEN 1 ELSE 0 END) AS topicsWithoutPrerequisites,
  SUM(CASE WHEN concept_count < 3 THEN 1 ELSE 0 END) AS topicsWithFewConcepts
FROM (
  SELECT
    t.id,
    COUNT(DISTINCT tc.concept_id) AS concept_count,
    COUNT(DISTINCT tp.prerequisite_topic_id) AS prereq_count
  FROM curriculum_topics t
  LEFT JOIN topic_concepts tc ON tc.topic_id=t.id
  LEFT JOIN topic_prerequisites tp ON tp.topic_id=t.id
  GROUP BY t.id
)
`).get() as any;

console.log("=== ALAI PHASE 6 CURRICULUM AUTONOMY AUDIT ===");
console.table([{ ...snapshot, ...weak }]);

console.log("=== WEAKEST DOMAINS ===");
console.table(db.prepare(`
SELECT
  d.name AS domain,
  dr.rollup_coverage_score AS rollup,
  dr.topics_count AS topics,
  dr.concepts_total AS concepts,
  dr.concepts_mastered AS mastered
FROM domain_coverage_rollup dr
JOIN academic_domains d ON d.id=dr.domain_id
ORDER BY dr.rollup_coverage_score ASC, dr.concepts_total ASC
LIMIT 20
`).all());

console.log("=== RECENT CURRICULUM DIRECTOR RUNS ===");
console.table(db.prepare(`
SELECT *
FROM alai_curriculum_autonomy_runs
ORDER BY started_at DESC
LIMIT 10
`).all());

const phase6Passed =
  snapshot.domains >= 20 &&
  snapshot.topics >= 200 &&
  snapshot.topicConcepts >= 1300 &&
  snapshot.topicPrerequisites >= 150 &&
  snapshot.completionRows >= snapshot.domains &&
  snapshot.topicRollups >= snapshot.topics &&
  snapshot.domainRollups >= snapshot.domains &&
  snapshot.directorRuns >= 1 &&
  snapshot.openFlags === 0 &&
  weak.topicsWithoutConcepts <= 10;

console.log("=== PHASE 6 STATUS ===");
console.log({
  phase6Passed,
  required: {
    domains: ">= 20",
    topics: ">= 200",
    topicConcepts: ">= 1300",
    topicPrerequisites: ">= 150",
    completionRows: ">= domains",
    topicRollups: ">= topics",
    domainRollups: ">= domains",
    directorRuns: ">= 1",
    openFlags: "0",
    topicsWithoutConcepts: "<= 10",
  }
});

db.close();

if (!phase6Passed) process.exit(1);

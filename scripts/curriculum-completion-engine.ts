import Database from "better-sqlite3";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

const domains = db.prepare(`
  SELECT id, name
  FROM academic_domains
`).all() as { id: string; name: string }[];

const upsert = db.prepare(`
  INSERT INTO curriculum_completion (
    domain_id,
    mapped_child_domains,
    total_child_domains,
    mapped_topics,
    total_topics,
    mapped_concepts,
    completion_score,
    known_coverage_score,
    effective_coverage_score,
    created_at,
    updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(domain_id) DO UPDATE SET
    mapped_child_domains = excluded.mapped_child_domains,
    total_child_domains = excluded.total_child_domains,
    mapped_topics = excluded.mapped_topics,
    total_topics = excluded.total_topics,
    mapped_concepts = excluded.mapped_concepts,
    completion_score = excluded.completion_score,
    known_coverage_score = excluded.known_coverage_score,
    effective_coverage_score = excluded.effective_coverage_score,
    updated_at = excluded.updated_at
`);

let measured = 0;

for (const domain of domains) {
  const childStats = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN confidence_score > 0 THEN 1 ELSE 0 END) AS mapped
    FROM academic_domains
    WHERE parent_domain_id = ?
  `).get(domain.id) as { total: number; mapped: number | null };

  const topicStats = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN confidence_score > 0 THEN 1 ELSE 0 END) AS mapped
    FROM curriculum_topics
    WHERE domain_id = ?
  `).get(domain.id) as { total: number; mapped: number | null };

  const conceptStats = db.prepare(`
    SELECT COUNT(DISTINCT tc.concept_id) AS mapped
    FROM topic_concepts tc
    JOIN curriculum_topics t ON t.id = tc.topic_id
    WHERE t.domain_id = ?
  `).get(domain.id) as { mapped: number };

  const coverage = db.prepare(`
    SELECT COALESCE(rollup_coverage_score, 0) AS coverage
    FROM domain_coverage_rollup
    WHERE domain_id = ?
  `).get(domain.id) as { coverage: number } | undefined;

  const mappedChildDomains = childStats.mapped ?? 0;
  const totalChildDomains = childStats.total ?? 0;
  const mappedTopics = topicStats.mapped ?? 0;
  const totalTopics = topicStats.total ?? 0;
  const mappedConcepts = conceptStats.mapped ?? 0;

  const childStructure = totalChildDomains === 0 ? 1 : mappedChildDomains / totalChildDomains;
  const topicStructure = totalTopics === 0 ? 0 : mappedTopics / totalTopics;

  const structureScore =
    totalChildDomains > 0 && totalTopics > 0
      ? (childStructure + topicStructure) / 2
      : totalTopics > 0
        ? topicStructure
        : totalChildDomains > 0
          ? childStructure
          : 0;

  const knownCoverage = coverage?.coverage ?? 0;

  /**
   * completion_score is NOT allowed to mean "the map exists".
   * It means "the domain is structurally mapped AND actually learned".
   */
  const completionScore = structureScore * knownCoverage;
  const effectiveCoverage = completionScore;

  upsert.run(
    domain.id,
    mappedChildDomains,
    totalChildDomains,
    mappedTopics,
    totalTopics,
    mappedConcepts,
    Number(completionScore.toFixed(3)),
    Number(knownCoverage.toFixed(3)),
    Number(effectiveCoverage.toFixed(3)),
    now,
    now
  );

  measured++;
}

console.log("Curriculum completion engine updated.");
console.log({ domainsMeasured: measured, completionMeansLearnedCoverage: true });

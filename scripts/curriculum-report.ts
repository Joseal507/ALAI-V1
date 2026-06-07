import Database from "better-sqlite3";

const db = new Database("data/alai.db");

function count(sql: string): number {
  const row = db.prepare(sql).get() as { count: number };
  return row.count;
}

console.log("\n=== ALAI Curriculum / Learning Report ===");

console.log({
  educationLevels: count(`SELECT COUNT(*) AS count FROM education_levels`),
  academicDomains: count(`SELECT COUNT(*) AS count FROM academic_domains`),
  curriculumTopics: count(`SELECT COUNT(*) AS count FROM curriculum_topics`),
  topicPrerequisites: count(`SELECT COUNT(*) AS count FROM topic_prerequisites`),
  topicConceptLinks: count(`SELECT COUNT(*) AS count FROM topic_concepts`),
  openLearningQueue: count(`SELECT COUNT(*) AS count FROM autonomous_learning_queue WHERE status = 'OPEN'`),
  completedLearningQueue: count(`SELECT COUNT(*) AS count FROM autonomous_learning_queue WHERE status = 'DONE'`),
  concepts: count(`SELECT COUNT(*) AS count FROM concepts`),
  verifiedConcepts: count(`SELECT COUNT(*) AS count FROM concepts WHERE status = 'VERIFIED'`),
  pendingConcepts: count(`SELECT COUNT(*) AS count FROM concepts WHERE status = 'PENDING'`),
  relations: count(`SELECT COUNT(*) AS count FROM relations`),
  evidence: count(`SELECT COUNT(*) AS count FROM evidence`),
  openGaps: count(`SELECT COUNT(*) AS count FROM knowledge_gaps WHERE status = 'OPEN'`),
});

console.log("\n=== Domain Tree ===");
const domains = db.prepare(`
  SELECT
    child.name,
    parent.name AS parent,
    child.depth,
    child.status,
    child.confidence_score AS confidence,
    COUNT(t.id) AS topics
  FROM academic_domains child
  LEFT JOIN academic_domains parent ON parent.id = child.parent_domain_id
  LEFT JOIN curriculum_topics t ON t.domain_id = child.id
  GROUP BY child.id
  ORDER BY COALESCE(parent.name, child.name), child.depth, child.name
`).all() as {
  name: string;
  parent: string | null;
  depth: number;
  status: string;
  confidence: number;
  topics: number;
}[];

console.table(
  domains.map((domain) => ({
    domain: `${"  ".repeat(domain.depth)}${domain.name}`,
    parent: domain.parent ?? "",
    status: domain.status,
    confidence: domain.confidence,
    topics: domain.topics,
  }))
);


console.log("\n=== Curriculum Topics ===");
const topics = db.prepare(`
  SELECT
    t.name,
    d.name AS domain,
    p.name AS parentTopic,
    t.depth,
    t.status,
    t.expansion_status AS expansionStatus,
    t.confidence_score AS confidence,
    COUNT(DISTINCT tc.concept_id) AS concepts,
    COUNT(DISTINCT tp.prerequisite_topic_id) AS prerequisites
  FROM curriculum_topics t
  LEFT JOIN academic_domains d ON d.id = t.domain_id
  LEFT JOIN curriculum_topics p ON p.id = t.parent_topic_id
  LEFT JOIN topic_concepts tc ON tc.topic_id = t.id
  LEFT JOIN topic_prerequisites tp ON tp.topic_id = t.id
  GROUP BY t.id
  ORDER BY COALESCE(d.name, ''), t.depth, t.name
  LIMIT 80
`).all() as {
  name: string;
  domain: string | null;
  parentTopic: string | null;
  depth: number;
  status: string;
  expansionStatus: string;
  confidence: number;
  concepts: number;
  prerequisites: number;
}[];

console.table(
  topics.map((topic) => ({
    topic: `${"  ".repeat(topic.depth)}${topic.name}`,
    domain: topic.domain ?? "",
    parentTopic: topic.parentTopic ?? "",
    status: topic.status,
    expansion: topic.expansionStatus,
    confidence: topic.confidence,
    concepts: topic.concepts,
    prerequisites: topic.prerequisites,
  }))
);


console.log("\n=== Concept Mastery Summary ===");
const masterySummary = db.prepare(`
  SELECT
    COUNT(*) AS conceptsMeasured,
    ROUND(AVG(mastery_score), 3) AS averageMastery,
    SUM(CASE WHEN mastery_score >= 0.7 THEN 1 ELSE 0 END) AS masteredConcepts
  FROM concept_mastery
`).get();

console.log(masterySummary);

console.log("\n=== Curriculum Coverage ===");
const coverage = db.prepare(`
  SELECT
    t.name AS topic,
    d.name AS domain,
    cc.concepts_total AS conceptsTotal,
    cc.concepts_mastered AS conceptsMastered,
    cc.average_mastery AS averageMastery,
    cc.coverage_score AS coverage
  FROM curriculum_coverage cc
  JOIN curriculum_topics t ON t.id = cc.topic_id
  LEFT JOIN academic_domains d ON d.id = t.domain_id
  ORDER BY cc.coverage_score DESC, t.name ASC
  LIMIT 30
`).all();

console.table(coverage);

console.log("\n=== Topic Coverage Rollup ===");
const topicRollup = db.prepare(`
  SELECT
    t.name AS topic,
    p.name AS parentTopic,
    tr.direct_coverage_score AS directCoverage,
    tr.rollup_coverage_score AS rollupCoverage,
    tr.child_topics_count AS children,
    tr.descendant_topics_count AS descendants,
    tr.concepts_total AS conceptsTotal,
    tr.concepts_mastered AS conceptsMastered
  FROM topic_coverage_rollup tr
  JOIN curriculum_topics t ON t.id = tr.topic_id
  LEFT JOIN curriculum_topics p ON p.id = t.parent_topic_id
  ORDER BY tr.rollup_coverage_score DESC, t.name ASC
  LIMIT 30
`).all();

console.table(topicRollup);

console.log("\n=== Domain Coverage Rollup ===");
const domainRollup = db.prepare(`
  SELECT
    d.name AS domain,
    parent.name AS parentDomain,
    dr.rollup_coverage_score AS rollupCoverage,
    dr.child_domains_count AS children,
    dr.topics_count AS topics,
    dr.concepts_total AS conceptsTotal,
    dr.concepts_mastered AS conceptsMastered
  FROM domain_coverage_rollup dr
  JOIN academic_domains d ON d.id = dr.domain_id
  LEFT JOIN academic_domains parent ON parent.id = d.parent_domain_id
  ORDER BY dr.rollup_coverage_score DESC, d.name ASC
  LIMIT 30
`).all();

console.table(domainRollup);


console.log("\n=== Curriculum Completion ===");
const completion = db.prepare(`
  SELECT
    d.name AS domain,
    parent.name AS parentDomain,
    c.mapped_child_domains AS mappedChildDomains,
    c.total_child_domains AS totalChildDomains,
    c.mapped_topics AS mappedTopics,
    c.total_topics AS totalTopics,
    c.mapped_concepts AS mappedConcepts,
    c.completion_score AS completion,
    c.known_coverage_score AS knownCoverage,
    c.effective_coverage_score AS effectiveCoverage
  FROM curriculum_completion c
  JOIN academic_domains d ON d.id = c.domain_id
  LEFT JOIN academic_domains parent ON parent.id = d.parent_domain_id
  ORDER BY c.effective_coverage_score DESC, d.name ASC
  LIMIT 30
`).all();

console.table(completion);

console.log("\n=== Open Learning Queue ===");
const queue = db.prepare(`
  SELECT objective, priority_score AS priority, attempts, status
  FROM autonomous_learning_queue
  WHERE status = 'OPEN'
  ORDER BY priority_score DESC, created_at ASC
  LIMIT 20
`).all();

console.table(queue);

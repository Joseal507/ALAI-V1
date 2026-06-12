import Database from "better-sqlite3";

const db = new Database("data/alai.db");

console.log("=== ALAI PHASE 7 DOMAIN GOVERNOR AUDIT ===");

const snapshot = db.prepare(`
SELECT
  (SELECT COUNT(*) FROM alai_domain_governor_runs) AS governorRuns,
  (SELECT COUNT(*) FROM alai_domain_learning_objectives) AS domainObjectives,
  (SELECT COUNT(*) FROM alai_domain_learning_objectives WHERE status='OPEN') AS openDomainObjectives,
  (SELECT COUNT(*) FROM alai_research_questions WHERE question_type='DOMAIN_GAP') AS domainResearchQuestions,
  (SELECT COUNT(*) FROM alai_research_questions WHERE status='OPEN') AS openResearchQuestions,
  (SELECT COUNT(*) FROM alai_quality_flags WHERE status='OPEN') AS openFlags
`).get() as any;

console.table([snapshot]);

console.log("=== TOP DOMAIN OBJECTIVES ===");
console.table(db.prepare(`
SELECT
  domain_name AS domain,
  priority_score AS priority,
  status,
  reason
FROM alai_domain_learning_objectives
ORDER BY priority_score DESC, created_at ASC
LIMIT 20
`).all());

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

const phase7Passed =
  snapshot.governorRuns >= 1 &&
  snapshot.domainObjectives >= 5 &&
  snapshot.openDomainObjectives >= 5 &&
  snapshot.domainResearchQuestions >= 5 &&
  snapshot.openFlags === 0;

console.log("=== PHASE 7 STATUS ===");
console.log({
  phase7Passed,
  required: {
    governorRuns: ">= 1",
    domainObjectives: ">= 5",
    openDomainObjectives: ">= 5",
    domainResearchQuestions: ">= 5",
    openFlags: "0",
  }
});

db.close();

if (!phase7Passed) process.exit(1);

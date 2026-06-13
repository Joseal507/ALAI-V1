import Database from "better-sqlite3";

const db = new Database("data/alai.db");

function n(sql: string): number {
  return Number((db.prepare(sql).get() as any)?.n ?? 0);
}

const snapshot = {
  impactRuns: n(`SELECT COUNT(*) AS n FROM alai_v5_curriculum_impact_runs`),
  impactLinks: n(`SELECT COUNT(*) AS n FROM alai_v5_curriculum_impact_links`),
  impactedObjectives: n(`SELECT COUNT(*) AS n FROM alai_v2_curriculum_full_study_queue WHERE status='IMPACTED'`),
  openFlags: n(`SELECT COUNT(*) AS n FROM alai_quality_flags WHERE status='OPEN'`),
  openResearch: n(`SELECT COUNT(*) AS n FROM alai_research_questions WHERE status='OPEN'`),
  duplicateRelations: n(`
    SELECT COUNT(*) AS n FROM (
      SELECT from_concept_id,to_concept_id,relation_type,COUNT(*) c
      FROM relations
      GROUP BY from_concept_id,to_concept_id,relation_type
      HAVING c>1
    )
  `)
};

console.log("=== ALAI V5 DOMAIN IMPACT AUDIT ===");
console.table([snapshot]);

console.log("");
console.log("=== DOMAIN COVERAGE SAMPLE ===");
console.table(db.prepare(`
SELECT d.name, ROUND(r.rollup_coverage_score,3) AS coverage, r.concepts_total, r.concepts_mastered
FROM domain_coverage_rollup r
JOIN academic_domains d ON d.id=r.domain_id
ORDER BY r.rollup_coverage_score ASC
LIMIT 12
`).all());

const passed =
  snapshot.impactRuns >= 1 &&
  snapshot.impactLinks >= 20 &&
  snapshot.impactedObjectives >= 10 &&
  snapshot.openFlags === 0 &&
  snapshot.openResearch === 0 &&
  snapshot.duplicateRelations === 0;

console.log({
  v5DomainImpactPassed: passed,
  impactScore: passed ? 78 : 55
});

db.close();

if (!passed) process.exit(1);

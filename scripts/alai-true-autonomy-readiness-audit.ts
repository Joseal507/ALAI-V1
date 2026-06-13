import Database from "better-sqlite3";

const db = new Database("data/alai.db");

function n(sql: string): number {
  return Number((db.prepare(sql).get() as any)?.n ?? 0);
}

const active = n(`SELECT COUNT(*) AS n FROM concepts WHERE status!='REJECTED'`);
const trusted = n(`SELECT COUNT(*) AS n FROM concepts WHERE status IN ('VERIFIED','CANONICAL')`);
const trustedRatio = active ? trusted / active : 0;

const snapshot = {
  concepts: n(`SELECT COUNT(*) AS n FROM concepts`),
  canonical: n(`SELECT COUNT(*) AS n FROM concepts WHERE status='CANONICAL'`),
  verified: n(`SELECT COUNT(*) AS n FROM concepts WHERE status='VERIFIED'`),
  pending: n(`SELECT COUNT(*) AS n FROM concepts WHERE status='PENDING'`),
  rejected: n(`SELECT COUNT(*) AS n FROM concepts WHERE status='REJECTED'`),
  trustedRatio: Number(trustedRatio.toFixed(3)),
  relations: n(`SELECT COUNT(*) AS n FROM relations`),
  beliefs: n(`SELECT COUNT(*) AS n FROM alai_beliefs`),
  episodicMemories: n(`SELECT COUNT(*) AS n FROM alai_episodic_memories`),
  plans: n(`SELECT COUNT(*) AS n FROM alai_long_term_plans`),
  studyObjectives: n(`SELECT COUNT(*) AS n FROM alai_curriculum_study_objectives`),
  governorRuns: n(`SELECT COUNT(*) AS n FROM alai_curriculum_autonomous_governor_runs`),
  openFlags: n(`SELECT COUNT(*) AS n FROM alai_quality_flags WHERE status='OPEN'`),
  openResearch: n(`SELECT COUNT(*) AS n FROM alai_research_questions WHERE status='OPEN'`),
  duplicateRelationGroups: n(`
    SELECT COUNT(*) AS n FROM (
      SELECT from_concept_id, to_concept_id, relation_type, COUNT(*) c
      FROM relations
      GROUP BY from_concept_id, to_concept_id, relation_type
      HAVING c > 1
    )
  `)
};

console.log("=== ALAI TRUE AUTONOMY READINESS AUDIT ===");
console.table([snapshot]);

const passed =
  snapshot.openFlags === 0 &&
  snapshot.openResearch <= 20 &&
  snapshot.duplicateRelationGroups === 0 &&
  snapshot.beliefs >= 500 &&
  snapshot.episodicMemories >= 10 &&
  snapshot.plans >= 1 &&
  snapshot.studyObjectives >= 1 &&
  snapshot.governorRuns >= 1 &&
  snapshot.pending <= 1200;

console.log({
  trueAutonomyReady: passed,
  estimatedReadinessScore: passed ? 88 : 78
});

db.close();

if (!passed) process.exit(1);

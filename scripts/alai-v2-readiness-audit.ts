import Database from "better-sqlite3";

const db = new Database("data/alai.db");

function n(sql: string): number {
  return Number((db.prepare(sql).get() as any)?.n ?? 0);
}

const snapshot = {
  v2Modules: n(`SELECT COUNT(*) AS n FROM alai_v2_core_modules WHERE status='ACTIVE'`),
  curriculumObjectives: n(`SELECT COUNT(*) AS n FROM alai_v2_curriculum_full_study_queue`),
  masteryTasks: n(`SELECT COUNT(*) AS n FROM alai_v2_mastery_tasks`),
  multistepPlans: n(`SELECT COUNT(*) AS n FROM alai_v2_multistep_plans`),
  multistepSteps: n(`SELECT COUNT(*) AS n FROM alai_v2_multistep_plan_steps`),
  answerRuns: n(`SELECT COUNT(*) AS n FROM alai_v2_answer_runs`),
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

console.log("=== ALAI V2 READINESS AUDIT ===");
console.table([snapshot]);

const passed =
  snapshot.v2Modules >= 5 &&
  snapshot.curriculumObjectives >= 20 &&
  snapshot.masteryTasks >= 100 &&
  snapshot.multistepPlans >= 3 &&
  snapshot.multistepSteps >= 15 &&
  snapshot.answerRuns >= 5 &&
  snapshot.openFlags === 0 &&
  snapshot.openResearch === 0 &&
  snapshot.duplicateRelationGroups === 0;

console.log({
  alaiV2Ready: passed,
  estimatedV2Score: passed ? 90 : 82
});

db.close();

if (!passed) process.exit(1);

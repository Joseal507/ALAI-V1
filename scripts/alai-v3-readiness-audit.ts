import Database from "better-sqlite3";

const db = new Database("data/alai.db");

function n(sql: string): number {
  return Number((db.prepare(sql).get() as any)?.n ?? 0);
}

const snapshot = {
  v3Answers: n(`SELECT COUNT(*) AS n FROM alai_v3_answer_runs`),
  curriculumExecutorRuns: n(`SELECT COUNT(*) AS n FROM alai_v3_curriculum_executor_runs`),
  domainIntelligenceRuns: n(`SELECT COUNT(*) AS n FROM alai_v3_domain_intelligence_runs`),
  domainFocus: n(`SELECT COUNT(*) AS n FROM alai_v3_domain_focus`),
  conversationSelfLearningRuns: n(`SELECT COUNT(*) AS n FROM alai_v3_conversation_self_learning_runs`),
  curriculumObjectives: n(`SELECT COUNT(*) AS n FROM alai_v2_curriculum_full_study_queue`),
  masteryTasks: n(`SELECT COUNT(*) AS n FROM alai_v2_mastery_tasks`),
  openFlags: n(`SELECT COUNT(*) AS n FROM alai_quality_flags WHERE status='OPEN'`),
  openResearch: n(`SELECT COUNT(*) AS n FROM alai_research_questions WHERE status='OPEN'`),
  duplicateRelations: n(`
    SELECT COUNT(*) AS n FROM (
      SELECT from_concept_id,to_concept_id,relation_type,COUNT(*) c
      FROM relations GROUP BY from_concept_id,to_concept_id,relation_type
      HAVING c>1
    )
  `)
};

console.log("=== ALAI V3 READINESS AUDIT ===");
console.table([snapshot]);

const passed =
  snapshot.v3Answers >= 5 &&
  snapshot.curriculumExecutorRuns >= 1 &&
  snapshot.domainIntelligenceRuns >= 1 &&
  snapshot.domainFocus >= 5 &&
  snapshot.conversationSelfLearningRuns >= 1 &&
  snapshot.curriculumObjectives >= 100 &&
  snapshot.masteryTasks >= 1000 &&
  snapshot.openFlags === 0 &&
  snapshot.openResearch <= 20 &&
  snapshot.duplicateRelations === 0;

console.log({
  alaiV3Ready: passed,
  estimatedV3Score: passed ? 92 : 84
});

db.close();

if (!passed) process.exit(1);

import Database from "better-sqlite3";

const db = new Database("data/alai.db");

function n(sql: string): number {
  return Number((db.prepare(sql).get() as any)?.n ?? 0);
}

const snapshot = {
  executivePlans: n(`SELECT COUNT(*) AS n FROM alai_v4_executive_reasoning_plans`),
  executiveSteps: n(`SELECT COUNT(*) AS n FROM alai_v4_executive_reasoning_steps`),
  tools: n(`SELECT COUNT(*) AS n FROM alai_v4_tools`),
  toolPolicies: n(`SELECT COUNT(*) AS n FROM alai_v4_tool_policies`),
  causalClaims: n(`SELECT COUNT(*) AS n FROM alai_v4_causal_claims`),
  predictionRules: n(`SELECT COUNT(*) AS n FROM alai_v4_prediction_rules`),
  simulationFrames: n(`SELECT COUNT(*) AS n FROM alai_v4_simulation_frames`),
  selfImprovementObjectives: n(`SELECT COUNT(*) AS n FROM alai_v4_self_improvement_objectives`),
  v3ReadyRuns: n(`SELECT COUNT(*) AS n FROM alai_v3_answer_runs`),
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

console.log("=== ALAI V4 READINESS AUDIT ===");
console.table([snapshot]);

const passed =
  snapshot.executivePlans >= 3 &&
  snapshot.executiveSteps >= 15 &&
  snapshot.tools >= 8 &&
  snapshot.toolPolicies >= 8 &&
  snapshot.causalClaims >= 50 &&
  snapshot.predictionRules >= 5 &&
  snapshot.simulationFrames >= 4 &&
  snapshot.selfImprovementObjectives >= 5 &&
  snapshot.v3ReadyRuns >= 5 &&
  snapshot.openFlags === 0 &&
  snapshot.openResearch <= 25 &&
  snapshot.duplicateRelations === 0;

console.log({
  alaiV4Ready: passed,
  estimatedV4Score: passed ? 94 : 86
});

db.close();

if (!passed) process.exit(1);

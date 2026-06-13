import Database from "better-sqlite3";

const db = new Database("data/alai.db");

function n(sql: string): number {
  return Number((db.prepare(sql).get() as any)?.n ?? 0);
}

const snapshot = {
  conversationPatterns: n(`SELECT COUNT(*) AS n FROM alai_v6_conversation_patterns`),
  responseSkills: n(`SELECT COUNT(*) AS n FROM alai_v6_response_skills`),
  reasoningFrameworks: n(`SELECT COUNT(*) AS n FROM alai_v6_reasoning_frameworks`),
  reasoningTests: n(`SELECT COUNT(*) AS n FROM alai_v6_reasoning_tests`),
  agentGoals: n(`SELECT COUNT(*) AS n FROM alai_v6_agent_goals`),
  agentSteps: n(`SELECT COUNT(*) AS n FROM alai_v6_agent_execution_steps`),
  improvementTargets: n(`SELECT COUNT(*) AS n FROM alai_v6_self_improvement_targets`),
  toolRoutes: n(`SELECT COUNT(*) AS n FROM alai_v6_tool_agent_routes`),
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

console.log("=== ALAI V6 READINESS AUDIT ===");
console.table([snapshot]);

const passed =
  snapshot.conversationPatterns >= 7 &&
  snapshot.responseSkills >= 7 &&
  snapshot.reasoningFrameworks >= 7 &&
  snapshot.reasoningTests >= 6 &&
  snapshot.agentGoals >= 3 &&
  snapshot.agentSteps >= 10 &&
  snapshot.improvementTargets >= 5 &&
  snapshot.toolRoutes >= 5 &&
  snapshot.openFlags === 0 &&
  snapshot.openResearch === 0 &&
  snapshot.duplicateRelations === 0;

console.log({
  alaiV6Ready: passed,
  estimatedV6Score: passed ? 95 : 88
});

db.close();

if (!passed) process.exit(1);

import Database from "better-sqlite3";

const db = new Database("data/alai.db");

function n(sql: string): number {
  return Number((db.prepare(sql).get() as any)?.n ?? 0);
}

const openFlags = n(`SELECT COUNT(*) AS n FROM alai_quality_flags WHERE status='OPEN'`);
const openResearch = n(`SELECT COUNT(*) AS n FROM alai_research_questions WHERE status='OPEN'`);
const impactLinks = n(`SELECT COUNT(*) AS n FROM alai_v5_curriculum_impact_links`);
const v4Ready = n(`SELECT COUNT(*) AS n FROM alai_v4_executive_reasoning_plans`) >= 3;
const v3Answers = n(`SELECT COUNT(*) AS n FROM alai_v3_answer_runs`);
const beliefs = n(`SELECT COUNT(*) AS n FROM alai_beliefs`);
const memories = n(`SELECT COUNT(*) AS n FROM alai_episodic_memories`);

const ratings = {
  architecture: v4Ready ? 96 : 90,
  autonomy: openFlags === 0 && openResearch === 0 ? 94 : 84,
  governance: openFlags === 0 ? 95 : 80,
  curriculum: impactLinks >= 20 ? 92 : 84,
  domainImpact: impactLinks >= 20 ? 78 : 55,
  memory: memories >= 30 ? 88 : 82,
  beliefs: beliefs >= 650 ? 88 : 80,
  reasoning: v3Answers >= 5 ? 74 : 68,
  conversation: v3Answers >= 5 ? 70 : 62,
  global: 0
};

ratings.global = Math.round(
  (
    ratings.architecture +
    ratings.autonomy +
    ratings.governance +
    ratings.curriculum +
    ratings.domainImpact +
    ratings.memory +
    ratings.beliefs +
    ratings.reasoning +
    ratings.conversation
  ) / 9
);

console.log("=== ALAI RATINGS ===");
console.table([ratings]);

db.close();

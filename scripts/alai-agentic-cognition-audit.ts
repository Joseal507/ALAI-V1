import Database from "better-sqlite3";

const db = new Database("data/alai.db");

function n(sql: string): number {
  return Number((db.prepare(sql).get() as any)?.n ?? 0);
}

const snapshot = {
  episodicMemories: n(`SELECT COUNT(*) AS n FROM alai_episodic_memories`),
  experienceLessons: n(`SELECT COUNT(*) AS n FROM alai_experience_lessons`),
  longTermPlans: n(`SELECT COUNT(*) AS n FROM alai_long_term_plans`),
  planTasks: n(`SELECT COUNT(*) AS n FROM alai_plan_tasks`),
  conversationEvents: n(`SELECT COUNT(*) AS n FROM alai_conversation_learning_events`),
  beliefs: n(`SELECT COUNT(*) AS n FROM alai_beliefs`),
  beliefRevisions: n(`SELECT COUNT(*) AS n FROM alai_belief_revisions`),
  openFlags: n(`SELECT COUNT(*) AS n FROM alai_quality_flags WHERE status='OPEN'`),
  openResearch: n(`SELECT COUNT(*) AS n FROM alai_research_questions WHERE status='OPEN'`)
};

console.log("=== ALAI AGENTIC COGNITION AUDIT ===");
console.table([snapshot]);

const passed =
  snapshot.episodicMemories >= 1 &&
  snapshot.experienceLessons >= 1 &&
  snapshot.longTermPlans >= 1 &&
  snapshot.planTasks >= 5 &&
  snapshot.beliefs >= 50;

console.log({ agenticCognitionInstalled: passed });

db.close();

if (!passed) process.exit(1);

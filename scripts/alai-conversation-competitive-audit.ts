import Database from "better-sqlite3";

const db = new Database("data/alai.db");

function n(sql: string): number {
  return Number((db.prepare(sql).get() as any)?.n ?? 0);
}

const stats = db.prepare(`
SELECT
  COUNT(*) AS runs,
  ROUND(AVG(self_score),3) AS avgScore,
  SUM(CASE WHEN self_score>=0.72 THEN 1 ELSE 0 END) AS strongRuns,
  SUM(memory_used) AS memoryUsed,
  SUM(beliefs_used) AS beliefsUsed,
  SUM(reasoning_traces_used) AS tracesUsed
FROM alai_conversational_reasoning_runs
`).get() as any;

const snapshot = {
  runs: Number(stats.runs || 0),
  avgScore: Number(stats.avgScore || 0),
  strongRuns: Number(stats.strongRuns || 0),
  memoryUsed: Number(stats.memoryUsed || 0),
  beliefsUsed: Number(stats.beliefsUsed || 0),
  tracesUsed: Number(stats.tracesUsed || 0),
  selfEvaluations: n(`SELECT COUNT(*) AS n FROM alai_conversation_self_evaluations`),
  openConversationGaps: n(`SELECT COUNT(*) AS n FROM alai_research_questions WHERE status='OPEN' AND question_type='CONVERSATION_LEARNING_GAP'`)
};

console.log("=== ALAI CONVERSATION COMPETITIVE AUDIT ===");
console.table([snapshot]);

const passed =
  snapshot.runs >= 5 &&
  snapshot.avgScore >= 0.72 &&
  snapshot.strongRuns >= 5 &&
  snapshot.memoryUsed >= 1 &&
  snapshot.beliefsUsed >= 1 &&
  snapshot.selfEvaluations >= 5;

console.log({
  conversationCompetitivePassed: passed,
  estimatedConversationScore: passed ? 72 : 55
});

db.close();

if (!passed) process.exit(1);

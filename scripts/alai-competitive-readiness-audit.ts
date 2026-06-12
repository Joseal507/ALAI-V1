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
  verified: n(`SELECT COUNT(*) AS n FROM concepts WHERE status='VERIFIED'`),
  canonical: n(`SELECT COUNT(*) AS n FROM concepts WHERE status='CANONICAL'`),
  pending: n(`SELECT COUNT(*) AS n FROM concepts WHERE status='PENDING'`),
  rejected: n(`SELECT COUNT(*) AS n FROM concepts WHERE status='REJECTED'`),
  trustedRatio: Number(trustedRatio.toFixed(3)),
  relations: n(`SELECT COUNT(*) AS n FROM relations`),
  evidence: n(`SELECT COUNT(*) AS n FROM evidence`),
  openResearch: n(`SELECT COUNT(*) AS n FROM alai_research_questions WHERE status='OPEN'`),
  openFlags: n(`SELECT COUNT(*) AS n FROM alai_quality_flags WHERE status='OPEN'`),
  reasoningTasks: n(`SELECT COUNT(*) AS n FROM alai_reasoning_tasks`),
  reasoningTraces: n(`SELECT COUNT(*) AS n FROM alai_reasoning_traces`),
  answerQualityScores: n(`SELECT COUNT(*) AS n FROM alai_answer_quality_scores`),
  beliefs: n(`SELECT COUNT(*) AS n FROM alai_beliefs`),
  beliefRevisions: n(`SELECT COUNT(*) AS n FROM alai_belief_revisions`),
  episodicMemories: n(`SELECT COUNT(*) AS n FROM alai_episodic_memories`),
  plans: n(`SELECT COUNT(*) AS n FROM alai_long_term_plans`),
  dualModeRuns: n(`SELECT COUNT(*) AS n FROM alai_dual_mode_governor_runs`)
};

const architecture = 94;
const autonomy = snapshot.dualModeRuns > 0 && snapshot.openFlags === 0 && snapshot.openResearch <= 20 ? 90 : 70;
const knowledge = Math.min(90, Math.round(snapshot.trustedRatio * 100) + 25);
const reasoning = snapshot.reasoningTraces >= 100 ? 72 : snapshot.reasoningTraces >= 20 ? 62 : 50;
const conversation = snapshot.episodicMemories >= 5 && snapshot.beliefs >= 100 ? 62 : 45;
const total = Math.round((architecture + autonomy + knowledge + reasoning + conversation) / 5);

console.log("=== ALAI COMPETITIVE READINESS AUDIT ===");
console.table([snapshot]);

console.log({
  estimatedScores: {
    architecture,
    autonomy,
    knowledge,
    reasoning,
    conversation,
    total
  }
});

const passed =
  snapshot.openFlags === 0 &&
  snapshot.openResearch <= 20 &&
  snapshot.reasoningTasks >= 100 &&
  snapshot.reasoningTraces >= 100 &&
  snapshot.answerQualityScores >= 100 &&
  snapshot.beliefs >= 100 &&
  snapshot.episodicMemories >= 5 &&
  snapshot.plans >= 1 &&
  total >= 75;

console.log({ competitiveReadinessPassed: passed });

db.close();

if (!passed) process.exit(1);

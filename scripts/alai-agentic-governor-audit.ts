import Database from "better-sqlite3";

const db = new Database("data/alai.db");

function tableExists(name: string): boolean {
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
}

function n(sql: string): number {
  return Number((db.prepare(sql).get() as any)?.n ?? 0);
}

function countTable(table: string): number {
  if (!tableExists(table)) return 0;
  return n(`SELECT COUNT(*) AS n FROM ${table}`);
}

const snapshot = {
  dualModeRuns: n(`SELECT COUNT(*) AS n FROM alai_dual_mode_governor_runs`),
  pendingPromotionRuns: n(`SELECT COUNT(*) AS n FROM alai_pending_promotion_v2_runs`),
  weakDomainRuns: countTable("alai_weak_domain_governor_v2_runs"),
  beliefRevisionRuns: n(`SELECT COUNT(*) AS n FROM alai_belief_revision_runs`),
  episodicExperienceRuns: n(`SELECT COUNT(*) AS n FROM alai_episodic_experience_runs`),
  openResearch: n(`SELECT COUNT(*) AS n FROM alai_research_questions WHERE status='OPEN'`),
  openFlags: n(`SELECT COUNT(*) AS n FROM alai_quality_flags WHERE status='OPEN'`),
  pending: n(`SELECT COUNT(*) AS n FROM concepts WHERE status='PENDING'`),
  verified: n(`SELECT COUNT(*) AS n FROM concepts WHERE status='VERIFIED'`),
  canonical: n(`SELECT COUNT(*) AS n FROM concepts WHERE status='CANONICAL'`),
  beliefs: n(`SELECT COUNT(*) AS n FROM alai_beliefs`),
  beliefRevisions: n(`SELECT COUNT(*) AS n FROM alai_belief_revisions`),
  episodicMemories: n(`SELECT COUNT(*) AS n FROM alai_episodic_memories`),
  plans: n(`SELECT COUNT(*) AS n FROM alai_long_term_plans`)
};

console.log("=== ALAI AGENTIC GOVERNOR AUDIT ===");
console.table([snapshot]);

const passed =
  snapshot.dualModeRuns >= 1 &&
  snapshot.pendingPromotionRuns >= 1 &&
  snapshot.beliefRevisionRuns >= 1 &&
  snapshot.episodicExperienceRuns >= 1 &&
  snapshot.openResearch <= 20 &&
  snapshot.openFlags === 0 &&
  snapshot.beliefs >= 50 &&
  snapshot.episodicMemories >= 3 &&
  snapshot.plans >= 1;

console.log({ agenticGovernorPassed: passed });

db.close();

if (!passed) process.exit(1);

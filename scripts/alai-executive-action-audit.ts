import Database from "better-sqlite3";

const db = new Database("data/alai.db");

console.log("=== ALAI EXECUTIVE ACTION AUDIT ===");

const snapshot = db.prepare(`
SELECT
  (SELECT COUNT(*) FROM alai_executive_action_runs) AS actionRuns,
  (SELECT COUNT(*) FROM alai_executive_missions) AS missions,
  (SELECT COUNT(*) FROM alai_executive_missions WHERE status='COMPLETED') AS completedMissions,
  (SELECT COUNT(*) FROM alai_executive_decisions WHERE status='OPEN') AS openDecisions,
  (SELECT COUNT(*) FROM alai_executive_decisions WHERE status='COMPLETED') AS completedDecisions,
  (SELECT COUNT(*) FROM alai_research_questions WHERE status='OPEN') AS openResearchQuestions,
  (SELECT COUNT(*) FROM alai_reasoning_challenges WHERE status IN ('OPEN','FAILED')) AS openOrFailedReasoning,
  (SELECT COUNT(*) FROM alai_quality_flags WHERE status='OPEN') AS openQualityFlags,
  (SELECT COUNT(*) FROM concepts) AS concepts,
  (SELECT COUNT(*) FROM relations) AS relations,
  (SELECT COUNT(*) FROM evidence) AS evidence
`).get() as any;

console.table([snapshot]);

console.log("=== RECENT ACTION RUNS ===");
console.table(db.prepare(`
SELECT *
FROM alai_executive_action_runs
ORDER BY started_at DESC
LIMIT 10
`).all());

console.log("=== REMAINING EXECUTIVE DECISIONS ===");
console.table(db.prepare(`
SELECT decision_type, target_name, priority_score, status
FROM alai_executive_decisions
ORDER BY priority_score DESC, created_at ASC
LIMIT 30
`).all());

const passed =
  snapshot.actionRuns >= 1 &&
  snapshot.missions >= 1 &&
  snapshot.completedMissions >= 1 &&
  snapshot.completedDecisions >= 1 &&
  snapshot.openResearchQuestions === 0 &&
  snapshot.openOrFailedReasoning === 0 &&
  snapshot.openQualityFlags === 0 &&
  snapshot.concepts >= 4500 &&
  snapshot.relations >= 20000 &&
  snapshot.evidence >= 10000;

console.log("=== EXECUTIVE ACTION STATUS ===");
console.log({
  executiveActionPassed: passed,
  required: {
    actionRuns: ">= 1",
    missions: ">= 1",
    completedMissions: ">= 1",
    completedDecisions: ">= 1",
    openResearchQuestions: "0",
    openOrFailedReasoning: "0",
    openQualityFlags: "0",
    concepts: ">= 4500",
    relations: ">= 20000",
    evidence: ">= 10000",
  },
});

db.close();

if (!passed) process.exit(1);

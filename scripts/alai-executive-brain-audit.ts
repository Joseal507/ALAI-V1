import Database from "better-sqlite3";

const db = new Database("data/alai.db");

console.log("=== ALAI PHASE 9 EXECUTIVE BRAIN AUDIT ===");

const snapshot = db.prepare(`
SELECT
  (SELECT COUNT(*) FROM alai_executive_brain_runs) AS executiveRuns,
  (SELECT COUNT(*) FROM alai_executive_decisions) AS executiveDecisions,
  (SELECT COUNT(*) FROM alai_executive_decisions WHERE status='OPEN') AS openExecutiveDecisions,
  (SELECT COUNT(*) FROM alai_domain_learning_objectives WHERE status='OPEN') AS openDomainObjectives,
  (SELECT COUNT(*) FROM autonomous_learning_queue WHERE status='OPEN') AS openAutonomyQueue,
  (SELECT COUNT(*) FROM alai_quality_flags WHERE status='OPEN') AS openFlags
`).get() as any;

console.table([snapshot]);

console.log("=== EXECUTIVE DECISIONS ===");
console.table(db.prepare(`
SELECT decision_type, target_name, priority_score, status, reason
FROM alai_executive_decisions
ORDER BY priority_score DESC, created_at ASC
LIMIT 25
`).all());

const phase9Passed =
  snapshot.executiveRuns >= 1 &&
  snapshot.executiveDecisions >= 8 &&
  snapshot.openExecutiveDecisions >= 8 &&
  snapshot.openDomainObjectives >= 5 &&
  snapshot.openAutonomyQueue >= 1 &&
  snapshot.openFlags === 0;

console.log("=== PHASE 9 STATUS ===");
console.log({
  phase9Passed,
  required: {
    executiveRuns: ">= 1",
    executiveDecisions: ">= 8",
    openExecutiveDecisions: ">= 8",
    openDomainObjectives: ">= 5",
    openAutonomyQueue: ">= 1",
    openFlags: "0"
  }
});

db.close();

if (!phase9Passed) process.exit(1);

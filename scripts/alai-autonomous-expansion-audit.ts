import Database from "better-sqlite3";

const db = new Database("data/alai.db");

console.log("=== ALAI PHASE 10 AUTONOMOUS EXPANSION AUDIT ===");

const snapshot = db.prepare(`
SELECT
  (SELECT COUNT(*) FROM alai_autonomous_expansion_runs) AS expansionRuns,
  (SELECT COUNT(*) FROM alai_autonomous_expansion_runs WHERE status IN ('COMPLETED','COMPLETED_WITH_WARNINGS')) AS finishedExpansionRuns,
  (SELECT COUNT(*) FROM alai_research_director_runs) AS researchDirectorRuns,
  (SELECT COUNT(*) FROM alai_curriculum_autonomy_runs) AS curriculumRuns,
  (SELECT COUNT(*) FROM alai_reasoning_breakthrough_runs) AS reasoningRuns,
  (SELECT COUNT(*) FROM alai_domain_governor_runs) AS domainGovernorRuns,
  (SELECT COUNT(*) FROM alai_executive_brain_runs) AS executiveRuns,
  (SELECT COUNT(*) FROM concepts) AS concepts,
  (SELECT COUNT(*) FROM relations) AS relations,
  (SELECT COUNT(*) FROM evidence) AS evidence,
  (SELECT COUNT(*) FROM topic_concepts) AS topicConcepts,
  (SELECT COUNT(*) FROM topic_prerequisites) AS topicPrerequisites,
  (SELECT COUNT(*) FROM alai_quality_flags WHERE status='OPEN') AS openFlags
`).get() as any;

console.table([snapshot]);

console.log("=== RECENT EXPANSION RUNS ===");
console.table(db.prepare(`
SELECT *
FROM alai_autonomous_expansion_runs
ORDER BY started_at DESC
LIMIT 10
`).all());

const phase10Passed =
  snapshot.expansionRuns >= 1 &&
  snapshot.finishedExpansionRuns >= 1 &&
  snapshot.researchDirectorRuns >= 1 &&
  snapshot.curriculumRuns >= 1 &&
  snapshot.reasoningRuns >= 1 &&
  snapshot.domainGovernorRuns >= 1 &&
  snapshot.executiveRuns >= 1 &&
  snapshot.concepts >= 4500 &&
  snapshot.relations >= 20000 &&
  snapshot.evidence >= 10000 &&
  snapshot.topicConcepts >= 1300 &&
  snapshot.topicPrerequisites >= 150 &&
  snapshot.openFlags === 0;

console.log("=== PHASE 10 STATUS ===");
console.log({
  phase10Passed,
  required: {
    expansionRuns: ">= 1",
    finishedExpansionRuns: ">= 1",
    researchDirectorRuns: ">= 1",
    curriculumRuns: ">= 1",
    reasoningRuns: ">= 1",
    domainGovernorRuns: ">= 1",
    executiveRuns: ">= 1",
    concepts: ">= 4500",
    relations: ">= 20000",
    evidence: ">= 10000",
    topicConcepts: ">= 1300",
    topicPrerequisites: ">= 150",
    openFlags: "0"
  }
});

db.close();

if (!phase10Passed) process.exit(1);

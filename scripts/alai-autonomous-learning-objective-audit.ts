import Database from "better-sqlite3";

const db = new Database("data/alai.db");

console.log("=== ALAI AUTONOMOUS LEARNING OBJECTIVE AUDIT ===");

const snapshot = db.prepare(`
SELECT
  (SELECT COUNT(*) FROM alai_autonomous_curiosity_runs) AS curiosityRuns,
  (SELECT COUNT(*) FROM alai_world_model_runs) AS worldModelRuns,
  (SELECT COUNT(*) FROM alai_hypotheses) AS hypotheses,
  (SELECT COUNT(*) FROM alai_hypotheses WHERE status IN ('OPEN','INVESTIGATING')) AS activeHypotheses,
  (SELECT COUNT(*) FROM alai_world_model_claims) AS worldModelClaims,
  (SELECT COUNT(*) FROM alai_world_model_focus) AS focusItems,
  (SELECT COUNT(*) FROM alai_world_model_focus WHERE status='MODELED') AS modeledFocusItems,
  (SELECT COUNT(*) FROM alai_research_questions WHERE status='OPEN') AS openResearchQuestions,
  (SELECT COUNT(*) FROM concepts) AS concepts,
  (SELECT COUNT(*) FROM relations) AS relations,
  (SELECT COUNT(*) FROM evidence) AS evidence,
  (SELECT COUNT(*) FROM alai_quality_flags WHERE status='OPEN') AS openQualityFlags
`).get() as any;

console.table([snapshot]);

console.log("=== ACTIVE HYPOTHESES SAMPLE ===");
console.table(db.prepare(`
SELECT hypothesis_type, target_name, priority_score, status
FROM alai_hypotheses
WHERE status IN ('OPEN','INVESTIGATING')
ORDER BY priority_score DESC
LIMIT 25
`).all());

console.log("=== OPEN RESEARCH SAMPLE ===");
console.table(db.prepare(`
SELECT question_type, question, priority_score, status
FROM alai_research_questions
WHERE status='OPEN'
ORDER BY priority_score DESC
LIMIT 25
`).all());

const passed =
  snapshot.curiosityRuns >= 1 &&
  snapshot.worldModelRuns >= 1 &&
  snapshot.hypotheses >= 20 &&
  snapshot.worldModelClaims >= 10 &&
  snapshot.focusItems >= 20 &&
  snapshot.modeledFocusItems >= 20 &&
  snapshot.openResearchQuestions >= 20 &&
  snapshot.concepts >= 4500 &&
  snapshot.relations >= 20000 &&
  snapshot.evidence >= 10000 &&
  snapshot.openQualityFlags === 0;

console.log("=== AUTONOMOUS LEARNING OBJECTIVE STATUS ===");
console.log({
  autonomousLearningObjectivePassed: passed,
  required: {
    curiosityRuns: ">= 1",
    worldModelRuns: ">= 1",
    hypotheses: ">= 20",
    worldModelClaims: ">= 10",
    focusItems: ">= 20",
    modeledFocusItems: ">= 20",
    openResearchQuestions: ">= 20",
    concepts: ">= 4500",
    relations: ">= 20000",
    evidence: ">= 10000",
    openQualityFlags: "0"
  }
});

db.close();

if (!passed) process.exit(1);

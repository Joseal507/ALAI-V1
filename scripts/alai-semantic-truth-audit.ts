import Database from "better-sqlite3";

const db = new Database("data/alai.db");

console.log("=== ALAI SEMANTIC TRUTH REASONING AUDIT ===");

const snapshot = db.prepare(`
SELECT
  (SELECT COUNT(*) FROM alai_semantic_truth_runs) AS semanticTruthRuns,
  (SELECT COUNT(*) FROM alai_semantic_truth_assessments) AS assessments,
  (SELECT COUNT(*) FROM alai_semantic_truth_assessments WHERE verdict='SEMANTICALLY_VALID') AS validAssessments,
  (SELECT COUNT(*) FROM alai_semantic_truth_assessments WHERE verdict='SEMANTICALLY_WEAK') AS weakAssessments,
  (SELECT COUNT(*) FROM alai_reasoning_challenges WHERE status='SEMANTIC_PASSED') AS semanticPassedChallenges,
  (SELECT COUNT(*) FROM alai_reasoning_challenges WHERE status='SEMANTIC_REJECTED') AS semanticRejectedChallenges,
  (SELECT COUNT(*) FROM alai_semantic_relation_flags WHERE status='OPEN') AS openSemanticRelationFlags,
  (SELECT COUNT(*) FROM alai_quality_flags WHERE status='OPEN') AS openQualityFlags,
  (SELECT COUNT(*) FROM relations WHERE confidence_score < 0.45) AS lowConfidenceRelations,
  (SELECT COUNT(*) FROM relations) AS relations
`).get() as any;

console.table([snapshot]);

console.log("=== SEMANTICALLY REJECTED SAMPLE ===");
console.table(db.prepare(`
SELECT
  ch.prompt,
  a.semantic_score AS semanticScore,
  a.reason
FROM alai_reasoning_challenges ch
JOIN alai_semantic_truth_assessments a ON a.challenge_id=ch.id
WHERE a.verdict='SEMANTICALLY_WEAK'
ORDER BY a.semantic_score ASC
LIMIT 25
`).all());

console.log("=== SEMANTICALLY VALID SAMPLE ===");
console.table(db.prepare(`
SELECT
  ch.prompt,
  a.semantic_score AS semanticScore,
  a.reason
FROM alai_reasoning_challenges ch
JOIN alai_semantic_truth_assessments a ON a.challenge_id=ch.id
WHERE a.verdict='SEMANTICALLY_VALID'
ORDER BY a.semantic_score DESC
LIMIT 25
`).all());

const phaseSemanticPassed =
  snapshot.semanticTruthRuns >= 1 &&
  snapshot.assessments >= 50 &&
  snapshot.semanticRejectedChallenges >= 20 &&
  snapshot.openQualityFlags === 0 &&
  snapshot.relations >= 20000;

console.log("=== SEMANTIC TRUTH STATUS ===");
console.log({
  phaseSemanticPassed,
  required: {
    semanticTruthRuns: ">= 1",
    assessments: ">= 50",
    semanticRejectedChallenges: ">= 20",
    openQualityFlags: "0",
    relations: ">= 20000"
  }
});

db.close();

if (!phaseSemanticPassed) process.exit(1);

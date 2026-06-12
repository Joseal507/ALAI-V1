import Database from "better-sqlite3";

const db = new Database("data/alai.db");

console.log("=== ALAI PHASE 8 REASONING BREAKTHROUGH AUDIT ===");

const snapshot = db.prepare(`
SELECT
  (SELECT COUNT(*) FROM alai_reasoning_breakthrough_runs) AS runs,
  (SELECT COUNT(*) FROM alai_reasoning_challenges) AS challenges,
  (SELECT COUNT(*) FROM alai_reasoning_challenges WHERE status='PASSED') AS passed,
  (SELECT COUNT(*) FROM alai_reasoning_challenges WHERE status='FAILED') AS failed,
  (SELECT ROUND(AVG(score),3) FROM alai_reasoning_challenges WHERE status='PASSED') AS averagePassedScore,
  (SELECT COUNT(*) FROM relations) AS relations,
  (SELECT COUNT(*) FROM concepts WHERE status IN ('VERIFIED','CANONICAL')) AS trustedConcepts,
  (SELECT COUNT(*) FROM alai_quality_flags WHERE status='OPEN') AS openFlags
`).get() as any;

console.table([snapshot]);

console.log("=== SAMPLE PASSED REASONING ===");
console.table(db.prepare(`
SELECT prompt, score, substr(answer,1,180) AS answer
FROM alai_reasoning_challenges
WHERE status='PASSED'
ORDER BY score DESC, updated_at DESC
LIMIT 15
`).all());

const phase8Passed =
  snapshot.runs >= 1 &&
  snapshot.challenges >= 40 &&
  snapshot.passed >= 30 &&
  snapshot.averagePassedScore >= 0.34 &&
  snapshot.trustedConcepts >= 3000 &&
  snapshot.relations >= 20000 &&
  snapshot.openFlags === 0;

console.log("=== PHASE 8 STATUS ===");
console.log({
  phase8Passed,
  required: {
    runs: ">= 1",
    challenges: ">= 40",
    passed: ">= 30",
    averagePassedScore: ">= 0.34",
    trustedConcepts: ">= 3000",
    relations: ">= 20000",
    openFlags: "0"
  }
});

db.close();

if (!phase8Passed) process.exit(1);

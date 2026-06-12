import Database from "better-sqlite3";
import { spawnSync } from "node:child_process";

const db = new Database("data/alai.db");

const tests = [
  "que es vector",
  "que relacion tiene vector con linear algebra",
  "compara vector y scalar",
  "explica machine learning con razonamiento",
  "para que sirve primary education"
];

let passed = 0;

for (const q of tests) {
  console.log(`\n========== TEST: ${q} ==========\n`);

  const result = spawnSync("npm", ["run", "alai:conversational-reasoning", "--", q], {
    stdio: "inherit"
  });

  if (result.status === 0) passed++;
}

const stats = db.prepare(`
SELECT
  COUNT(*) AS runs,
  ROUND(AVG(self_score),3) AS avgScore,
  SUM(CASE WHEN self_score>=0.72 THEN 1 ELSE 0 END) AS passedRuns
FROM alai_conversational_reasoning_runs
`).get() as any;

console.log("\n=== ALAI CONVERSATIONAL REASONING AUDIT ===");
console.table([stats]);

const ok =
  passed === tests.length &&
  Number(stats.runs) >= tests.length &&
  Number(stats.avgScore) >= 0.72;

console.log({ conversationalReasoningPassed: ok });

db.close();

if (!ok) process.exit(1);

import Database from "better-sqlite3";
import { spawnSync } from "node:child_process";

const db = new Database("data/alai.db");

const tests = [
  "explica machine learning",
  "que relacion tiene vector con linear algebra",
  "compara vector y scalar",
  "para que sirve primary education",
  "que es artificial general intelligence"
];

let ok = 0;

for (const q of tests) {
  console.log(`\n========== SEMANTIC ANSWER TEST: ${q} ==========\n`);
  const result = spawnSync("npm", ["run", "alai:semantic-answer", "--", q], {stdio:"inherit"});
  if (result.status === 0) ok++;
}

const stats = db.prepare(`
SELECT
  COUNT(*) AS runs,
  ROUND(AVG(quality_score),3) AS avgQuality,
  SUM(CASE WHEN quality_score>=0.75 THEN 1 ELSE 0 END) AS passed
FROM alai_semantic_answer_runs
`).get() as any;

console.log("\n=== ALAI SEMANTIC ANSWER AUDIT ===");
console.table([stats]);

const passed =
  ok === tests.length &&
  Number(stats.runs) >= tests.length &&
  Number(stats.avgQuality) >= 0.75;

console.log({ semanticAnswerComposerPassed: passed });

db.close();

if (!passed) process.exit(1);

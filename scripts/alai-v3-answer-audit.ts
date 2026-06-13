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

let passed = 0;

for (const t of tests) {
  console.log(`\n========== V3 ANSWER TEST: ${t} ==========\n`);
  const result = spawnSync("npm", ["run", "alai:v3-answer", "--", t], { stdio: "inherit" });
  if (result.status === 0) passed++;
}

const stats = db.prepare(`
SELECT COUNT(*) AS runs, ROUND(AVG(quality_score),3) AS avgQuality
FROM alai_v3_answer_runs
`).get() as any;

console.log("=== ALAI V3 ANSWER AUDIT ===");
console.table([stats]);

const ok = passed === tests.length && Number(stats.avgQuality || 0) >= 0.76;
console.log({ v3AnswerLayerPassed: ok });

db.close();

if (!ok) process.exit(1);

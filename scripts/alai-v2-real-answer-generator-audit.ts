import Database from "better-sqlite3";
import { spawnSync } from "node:child_process";

const db = new Database("data/alai.db");

const tests = [
  "explica machine learning",
  "que relacion tiene vector con linear algebra",
  "compara vector y scalar",
  "que es artificial general intelligence",
  "para que sirve primary education"
];

let passed = 0;

for (const t of tests) {
  console.log(`\n========== V2 ANSWER TEST: ${t} ==========\n`);
  const result = spawnSync("npm", ["run", "alai:v2-answer", "--", t], { stdio: "inherit" });
  if (result.status === 0) passed++;
}

const stats = db.prepare(`
SELECT COUNT(*) AS runs, ROUND(AVG(quality_score),3) AS avgQuality
FROM alai_v2_answer_runs
`).get() as any;

console.log("=== ALAI V2 REAL ANSWER AUDIT ===");
console.table([stats]);

const ok = passed === tests.length && Number(stats.avgQuality || 0) >= 0.72;
console.log({ v2RealAnswerGeneratorPassed: ok });

db.close();

if (!ok) process.exit(1);

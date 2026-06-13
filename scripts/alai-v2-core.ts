import { spawnSync } from "node:child_process";

const steps = [
  "alai:v2-core-consolidator",
  "alai:v2-curriculum-full-study",
  "alai:v2-domain-mastery-expansion",
  "alai:v2-multistep-planner",
  "alai:v2-real-answer-generator-audit",
  "alai:true-autonomy-readiness",
  "model:health"
];

let failed = 0;

for (const step of steps) {
  console.log(`\n========== ${step} ==========\n`);
  const result = spawnSync("npm", ["run", step], { stdio: "inherit" });
  if (result.status !== 0) {
    failed++;
    console.error(`FAILED STEP: ${step}`);
    break;
  }
}

if (failed > 0) process.exit(1);

console.log("ALAI V2 core cycle completed.");

import { spawnSync } from "node:child_process";

const steps = [
  "alai:v4-executive-reasoning",
  "alai:v4-tool-use",
  "alai:v4-world-model",
  "alai:v4-infinite-curriculum-loop",
  "alai:v4-self-improvement",
  "alai:v4-readiness",
  "model:health"
];

let failed = 0;

for (const step of steps) {
  console.log(`\n========== ${step} ==========\n`);
  const r = spawnSync("npm", ["run", step], { stdio: "inherit" });
  if (r.status !== 0) {
    failed++;
    console.error(`FAILED STEP: ${step}`);
    break;
  }
}

if (failed > 0) process.exit(1);

console.log("ALAI V4 core cycle completed.");

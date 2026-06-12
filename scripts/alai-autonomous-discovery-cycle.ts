import { spawnSync } from "node:child_process";

const steps = [
  "alai:autonomous-curiosity",
  "alai:world-model",
  "alai:research-governor",
  "alai:research-executor",
  "alai:research-closure",
  "alai:research-gap-closer",
  "alai:curriculum-auto-map",
  "curriculum:completion-sync",
  "curriculum:completion",
  "curriculum:rollup",
  "alai:semantic-truth-cycle",
  "alai:autonomous-objective-audit",
  "model:health"
];

let failed = 0;

for (const step of steps) {
  console.log(`\n========== AUTONOMOUS DISCOVERY STEP: npm run ${step} ==========\n`);

  const result = spawnSync("npm", ["run", step], {
    stdio: "inherit",
    shell: false,
    env: process.env
  });

  if (result.status !== 0) {
    failed++;
    console.error(`Step failed: ${step}`);
    break;
  }
}

if (failed > 0) process.exit(1);

console.log("\nALAI autonomous discovery cycle completed.");

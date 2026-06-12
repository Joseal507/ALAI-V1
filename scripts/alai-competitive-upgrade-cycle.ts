import { spawnSync } from "node:child_process";

const steps = [
  "alai:agentic-governor-cycle",
  "alai:deep-reasoning-governor",
  "alai:chain-reasoning",
  "alai:answer-quality",
  "alai:belief-revision",
  "alai:episodic-experience",
  "alai:competitive-readiness-audit",
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

console.log("ALAI competitive upgrade cycle completed.");

import { spawnSync } from "node:child_process";

const steps = [
  "alai:research-auto-closer",
  "alai:cognitive-debt-governor",
  "alai:pending-promotion-v2",
  "alai:research-gap-closer",
  "alai:belief-system",
  "alai:belief-revision",
  "alai:episodic-experience",
  "alai:semantic-relation-grounding-v2",
  "alai:relation-court",
  "alai:trace-court",
  "alai:path-quality",
  "alai:answer-synthesis-audit",
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

console.log("ALAI curriculum final readiness cycle completed.");

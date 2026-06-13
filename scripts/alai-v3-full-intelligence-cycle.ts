import { spawnSync } from "node:child_process";

const steps = [
  "alai:v3-domain-intelligence",
  "alai:v3-curriculum-executor",
  "alai:v3-answer-audit",
  "alai:v3-conversation-self-learning",
  "alai:research-auto-closer",
  "alai:cognitive-debt-governor",
  "alai:pending-promotion-v2",
  "alai:belief-system",
  "alai:belief-revision",
  "alai:semantic-relation-grounding-v2",
  "alai:relation-court",
  "alai:trace-court",
  "alai:path-quality",
  "alai:v3-readiness",
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

console.log("ALAI V3 full intelligence cycle completed.");

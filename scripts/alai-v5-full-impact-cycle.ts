import { spawnSync } from "node:child_process";

const steps = [
  "alai:v3-domain-intelligence",
  "alai:v3-curriculum-executor",
  "alai:research-auto-closer",
  "alai:v5-curriculum-impact",
  "alai:pending-promotion-v2",
  "alai:belief-system",
  "alai:belief-revision",
  "alai:semantic-relation-grounding-v2",
  "alai:relation-court",
  "alai:trace-court",
  "alai:path-quality",
  "alai:v5-domain-impact-audit",
  "alai:v4-readiness",
  "alai:v3-readiness",
  "alai:true-autonomy-readiness",
  "model:health"
];

for (const step of steps) {
  console.log(`\n========== ${step} ==========\n`);
  const result = spawnSync("npm", ["run", step], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log("ALAI V5 full impact cycle completed.");

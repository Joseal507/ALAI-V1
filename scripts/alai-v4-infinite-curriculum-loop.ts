import { spawnSync } from "node:child_process";

const steps = [
  "alai:v3-domain-intelligence",
  "alai:v3-curriculum-executor",
  "alai:research-auto-closer",
  "alai:pending-promotion-v2",
  "alai:belief-system",
  "alai:belief-revision",
  "alai:semantic-relation-grounding-v2",
  "alai:relation-court",
  "alai:trace-court",
  "alai:path-quality",
  "alai:v3-readiness"
];

for (const step of steps) {
  console.log(`\n========== ${step} ==========\n`);
  const r = spawnSync("npm", ["run", step], { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status || 1);
}

console.log("ALAI V4 infinite curriculum loop single cycle completed.");

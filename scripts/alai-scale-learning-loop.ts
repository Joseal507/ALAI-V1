import { spawnSync } from "node:child_process";

const steps = [
  "alai:v17-regression",
  "alai:v16-core",
  "alai:v12-bridges",

  "alai:research-auto-closer",
  "alai:research-gap-closer",
  "alai:cognitive-debt-governor",

  "alai:pending-promotion-v2",
  "alai:belief-system",
  "alai:belief-revision",
  "alai:episodic-experience",

  "alai:semantic-relation-grounding-v2",
  "alai:relation-court",
  "alai:trace-court",
  "alai:path-quality",

  "alai:final-scale-readiness",
  "model:health"
];

for (const step of steps) {
  console.log(`\n========== ${step} ==========\n`);

  const r = spawnSync("npm", ["run", step], {
    stdio: "inherit",
    timeout: 240000
  });

  if (r.status !== 0) {
    console.error(`STEP FAILED BUT LOOP WILL CONTINUE NEXT CYCLE: ${step}`);
  }
}

console.log("\nALAI scale learning loop completed.");

import { spawnSync } from "node:child_process";

const steps = [
  "alai:research-governor",
  "alai:evidence-backfill",
  "capabilities:generate-basic",
  "concepts:fill-core-support",
  "alai:graph-density",
  "relations:dedupe",
  "reason:graph",
  "alai:infer",
  "alai:self-test",
  "alai:autonomous-exam",
  "alai:grounded-exam",
  "alai:competency",
  "alai:sync-competency",
  "alai:strict-mastery",
  "knowledge:promote",
  "alai:mastery",
  "alai:curriculum-auto-map",
  "alai:curriculum-completion",
  "alai:audit-verified",
  "alai:metacognition",
  "model:health",
];

for (const step of steps) {
  console.log(`\n=== ${step} ===`);

  const result = spawnSync("npm", ["run", step], {
    stdio: "inherit",
    shell: false,
  });

  if (result.status !== 0) {
    console.error(`Step failed: ${step}`);
    process.exit(result.status ?? 1);
  }
}

console.log("\nALAI validation accelerator cycle completed.");

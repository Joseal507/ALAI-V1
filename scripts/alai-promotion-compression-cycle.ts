import { spawnSync } from "node:child_process";

const steps = [
  "alai:promotion-accelerator",
  "alai:knowledge-compression",
  "relations:dedupe",
  "ontology:repair",
  "alai:contradictions",
  "alai:competency",
  "alai:sync-competency",
  "alai:strict-mastery",
  "alai:knowledge-court",
  "alai:curriculum-auto-map",
  "alai:curriculum-completion",
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

console.log("\nALAI promotion/compression cycle completed.");

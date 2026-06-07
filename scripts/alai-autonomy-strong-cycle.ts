import { spawnSync } from "node:child_process";

const steps = [
  "ontology:repair",
  "alai:contradictions",
  "concepts:merge-aliases",
  "alai:canonicalize-concepts",
  "relations:dedupe",
  "reason:graph",
  "alai:infer",
  "concepts:strengthen-related",
  "knowledge:promote",
  "alai:mastery",
  "gaps:discover",
  "alai:questions",
  "alai:research-executor",
  "alai:seed-expanded-domain-topics",
  "alai:curriculum-auto-map",
  "alai:curriculum-completion",
  "concepts:prune-noise",
  "alai:clean-orphan-questions",
  "model:health",
];

for (const step of steps) {
  console.log(`\n=== ${step} ===`);

  const result = spawnSync("npm", ["run", step], {
    stdio: "inherit",
    shell: true,
  });

  if (result.status !== 0) {
    console.error(`Step failed: ${step}`);
    process.exit(result.status ?? 1);
  }
}

console.log("\nStrong autonomy cycle completed.");

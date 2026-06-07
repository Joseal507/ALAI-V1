import { spawnSync } from "node:child_process";

const steps = [
  "alai:metacognition",
  "alai:prioritize",
  "alai:objectives",
  "alai:queue-worker",
  "alai:questions",
  "alai:research-executor",
  "alai:verify-evidence",
  "learn:relations",
  "ontology:repair",
  "alai:contradictions",
  "concepts:merge-aliases",
  "alai:canonicalize-concepts",
  "relations:dedupe",
  "reason:graph",
  "alai:infer",
  "concepts:strengthen-related",
  "capabilities:generate-basic",
  "concepts:fill-core-support",
  "knowledge:promote",
  "alai:mastery",
  "alai:competency",
  "alai:self-test",
  "alai:autonomous-exam",
  "alai:grounded-exam",
  "alai:competency",
  "alai:sync-competency",
  "alai:strict-mastery",
  "alai:mastery",
  "gaps:discover",
  "alai:seed-expanded-domain-topics",
  "alai:curriculum-auto-map",
  "alai:curriculum-completion",
  "concepts:prune-noise",
  "alai:clean-orphan-questions",
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

console.log("\nALAI cognitive autonomy cycle completed.");

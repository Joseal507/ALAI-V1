import { spawnSync } from "node:child_process";

const steps = [
  ["ontology:repair", "Repair ontology"],
  ["alai:contradictions", "Detect contradictions"],
  ["concepts:merge-aliases", "Merge alias concepts"],
  ["alai:canonicalize-concepts", "Canonicalize duplicate concepts"],
  ["relations:dedupe", "Dedupe relations"],
  ["reason:graph", "Infer graph relations"],
  ["alai:infer", "Run inference engine"],
  ["concepts:strengthen-related", "Strengthen related concepts"],
  ["knowledge:promote", "Promote knowledge"],
  ["alai:mastery", "Evaluate concept mastery"],
  ["gaps:discover", "Discover learning gaps"],
  ["alai:questions", "Generate research questions"],
  ["alai:research-executor", "Execute research questions"],
  ["curriculum:fill-gaps", "Fill curriculum gaps"],
  ["concepts:fill-abstract-relations", "Fill abstract concept relations"],
  ["concepts:fill-core-support", "Fill core concept support"],
  ["capabilities:generate-basic", "Generate basic capabilities"],
  ["gaps:close", "Close resolved gaps"],
  ["alai:mastery", "Evaluate concept mastery"],
  ["alai:promote-mastered", "Promote mastered concepts"],
  ["alai:curriculum-completion", "Sync curriculum completion"],
  ["concepts:prune-noise", "Prune noise concepts"],
  ["model:health", "Check world model health"],
];

for (const [script, label] of steps) {
  console.log(`\n=== ${label} ===`);

  const result = spawnSync("npm", ["run", script], {
    stdio: "inherit",
    shell: false,
  });

  if (result.status !== 0) {
    console.error(`Step failed: ${script}`);
    process.exit(result.status ?? 1);
  }
}

console.log("\nAutonomy cycle completed.");

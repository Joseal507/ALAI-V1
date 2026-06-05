import { spawnSync } from "node:child_process";

const steps = [
  ["ontology:repair", "Repair ontology"],
  ["concepts:merge-aliases", "Merge alias concepts"],
  ["relations:dedupe", "Dedupe relations"],
  ["reason:graph", "Infer graph relations"],
  ["knowledge:promote", "Promote knowledge"],
  ["gaps:close", "Close resolved gaps"],
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

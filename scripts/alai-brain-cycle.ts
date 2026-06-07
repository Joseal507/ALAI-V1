import { spawnSync } from "node:child_process";

const steps = [
  ["education:seed", "Seed education ladder"],
  ["curriculum:audit", "Audit curriculum taxonomy"],
  ["curriculum:measure", "Measure mastery and coverage"],
  ["curriculum:rollup", "Calculate coverage rollups"],
  ["curriculum:completion", "Calculate curriculum completion"],
  ["autonomy:cycle", "Run autonomy maintenance cycle"],
  ["alai:stage-eval", "Evaluate current ALAI stage"],
  ["curriculum:report", "Print curriculum report"],
];

for (const [script, label] of steps) {
  console.log(`\n=== ${label} ===\n`);

  const result = spawnSync("npm", ["run", script], {
    stdio: "inherit",
    shell: true,
  });

  if (result.status !== 0) {
    console.error(`\nALAI brain cycle failed at step: ${script}`);
    process.exit(result.status ?? 1);
  }
}

console.log("\nALAI brain cycle completed.");

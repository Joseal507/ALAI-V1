import { spawnSync } from "node:child_process";

const steps = [
  ["autonomy:learn", "Autonomous learning"],
  ["autonomy:cycle", "Autonomous maintenance cycle"],
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

console.log("\nFull autonomy cycle completed.");

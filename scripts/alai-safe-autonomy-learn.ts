import { spawnSync } from "node:child_process";

console.log("\n=== Safe external knowledge learning ===\n");

const result = spawnSync("npm", ["run", "autonomy:learn"], {
  stdio: "inherit",
  shell: true,
});

if (result.status !== 0) {
  console.warn("\nExternal learning failed, but ALAI will continue.");
  console.warn("Reason: autonomy:learn returned non-zero exit.");
  process.exit(0);
}

console.log("\nExternal learning completed safely.");

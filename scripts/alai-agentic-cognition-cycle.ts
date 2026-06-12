import { spawnSync } from "node:child_process";

const steps = [
  "alai:episodic-memory",
  "alai:long-term-planner",
  "alai:conversation-learning",
  "alai:belief-system",
  "alai:agentic-cognition-audit"
];

for (const step of steps) {
  console.log(`\n========== ${step} ==========\n`);
  const result = spawnSync("npm", ["run", step], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log("ALAI agentic cognition cycle completed.");

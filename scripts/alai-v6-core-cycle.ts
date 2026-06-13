import { spawnSync } from "node:child_process";

const steps = [
  "alai:v6-conversation",
  "alai:v6-deep-reasoning",
  "alai:v6-agent-execution",
  "alai:v6-self-improvement",
  "alai:v6-tool-agent",
  "alai:v6-readiness",
  "alai:v6-ratings",
  "alai:v5-domain-impact-audit",
  "alai:v4-readiness",
  "alai:v3-readiness",
  "alai:true-autonomy-readiness",
  "model:health"
];

for (const step of steps) {
  console.log(`\n========== ${step} ==========\n`);
  const result = spawnSync("npm", ["run", step], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log("ALAI V6 core cycle completed.");

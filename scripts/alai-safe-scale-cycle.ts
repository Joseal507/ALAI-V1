import { spawnSync } from "node:child_process";

const jobs: [string, number][] = [
  ["alai:v17-regression", 180000],
  ["alai:v16-core", 120000],
  ["alai:v12-bridges", 120000],

  ["alai:research-executor", 300000],
  ["alai:research-auto-closer", 180000],
  ["alai:research-gap-closer", 180000],

  ["alai:cognitive-debt-governor", 180000],
  ["alai:pending-promotion-v2", 180000],
  ["alai:belief-system", 180000],
  ["alai:belief-revision", 180000],
  ["alai:episodic-experience", 120000],

  ["alai:semantic-relation-grounding-v2", 300000],
  ["alai:relation-court", 300000],
  ["alai:trace-court", 180000],
  ["alai:path-quality", 180000],

  ["alai:final-scale-readiness", 240000],
  ["model:health", 120000]
];

for (const [job, timeout] of jobs) {
  const r = spawnSync("npm", ["run", "alai:safe-job", "--", job, String(timeout)], {
    stdio: "inherit",
    timeout: timeout + 90000
  });

  if (r.status !== 0) {
    console.log(`SAFE CYCLE CONTINUES AFTER: ${job}`);
  }
}

console.log("ALAI safe scale cycle completed.");

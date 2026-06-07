import { spawnSync } from "node:child_process";

const cycles = Number(process.env.ALAI_CYCLES ?? "3");

const steps = [
  "alai:gaps",
  "alai:questions",
  "alai:answer-questions",
  "alai:objectives",
  "alai:prioritize",
  "alai:external-learn",
  "alai:learn",
  "alai:verify-evidence",
  "alai:quality",
  "alai:safety-gate",
  "alai:queue-safety",
  "alai:freeze-future",
  "alai:clear-invalid-autogrades",
  "alai:seed-algebra-core",
  "alai:concept-gate",
  "alai:seed-active-domain",
  "alai:queue-worker",
  "alai:core-relations",
  "alai:self-test",
  "alai:autonomous-exam",
  "alai:competency",
  "alai:sync-competency",
  "alai:strict-mastery",
  "alai:validate-mastery",
  "curriculum:measure",
  "curriculum:rollup",
  "curriculum:completion",
  "alai:stage-eval",
  "alai:promote",
  "alai:gate-expansion",
  "alai:expand",
  "alai:knowledge-expand",
];

for (let cycle = 1; cycle <= cycles; cycle++) {
  console.log(`\n==============================`);
  console.log(`ALAI AUTONOMOUS CYCLE ${cycle}/${cycles}`);
  console.log(`==============================\n`);

  for (const script of steps) {
    console.log(`\n=== npm run ${script} ===\n`);

    const result = spawnSync("npm", ["run", script], {
      stdio: "inherit",
      shell: true,
    });

    if (result.status !== 0) {
      console.error(`ALAI autonomous scheduler failed at: ${script}`);
      process.exit(result.status ?? 1);
    }
  }
}

console.log("\nALAI autonomous scheduler completed.");

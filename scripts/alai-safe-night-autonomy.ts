import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const cycles = Number(process.env.ALAI_NIGHT_CYCLES || 6);
const sleepSeconds = Number(process.env.ALAI_NIGHT_SLEEP_SECONDS || 60);
const maxFailures = Number(process.env.ALAI_NIGHT_MAX_FAILURES || 2);

const steps = [
  ["alai:purge-blocked", "Reject blocked pending knowledge"],
  ["alai:resolve-contradictions", "Resolve known contradictions"],
  ["alai:research-executor", "Execute limited research"],
  ["alai:purge-blocked", "Reject blocked pending knowledge again"],
  ["knowledge:promote", "Promote knowledge"],
  ["alai:mastery", "Evaluate mastery"],
  ["alai:promote-mastered", "Promote mastered"],
  ["concepts:prune-noise", "Prune noise"],
  ["model:health", "Health check"],
];

const logDir = path.join("logs", "safe-night-autonomy");
fs.mkdirSync(logDir, { recursive: true });

function sleep(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

let failures = 0;

console.log("ALAI Safe Night Autonomy started.");
console.log({ cycles, sleepSeconds, maxFailures });

for (let cycle = 1; cycle <= cycles; cycle++) {
  console.log(`\n=== SAFE NIGHT CYCLE ${cycle}/${cycles} ===`);
  const cycleLog: string[] = [];

  for (const [script, label] of steps) {
    console.log(`\n--- ${label} ---`);

    const result = spawnSync("npm", ["run", script], {
      encoding: "utf8",
      shell: false,
    });

    cycleLog.push(`\n=== ${label} (${script}) ===`);
    cycleLog.push(result.stdout || "");
    cycleLog.push(result.stderr || "");

    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);

    if (result.status !== 0) {
      failures++;
      console.error(`Step failed: ${script}. failures=${failures}/${maxFailures}`);

      if (failures >= maxFailures) {
        fs.writeFileSync(
          path.join(logDir, `cycle-${cycle}-failed.log`),
          cycleLog.join("\n")
        );
        process.exit(result.status ?? 1);
      }
    }
  }

  fs.writeFileSync(
    path.join(logDir, `cycle-${String(cycle).padStart(3, "0")}.log`),
    cycleLog.join("\n")
  );

  failures = 0;

  if (cycle < cycles) {
    console.log(`Sleeping ${sleepSeconds}s...`);
    sleep(sleepSeconds * 1000);
  }
}

console.log("\nALAI Safe Night Autonomy completed.");

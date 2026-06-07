import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const cycles = Number(process.env.ALAI_NIGHT_CYCLES || 8);
const sleepSeconds = Number(process.env.ALAI_NIGHT_SLEEP_SECONDS || 30);
const maxFailures = Number(process.env.ALAI_NIGHT_MAX_FAILURES || 2);

const logDir = path.join("logs", "night-autonomy");
fs.mkdirSync(logDir, { recursive: true });

function now() {
  return new Date().toISOString();
}

function sleep(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

let failures = 0;

console.log("ALAI Night Autonomy started.");
console.log({
  cycles,
  sleepSeconds,
  maxFailures,
  startedAt: now(),
});

for (let cycle = 1; cycle <= cycles; cycle++) {
  const startedAt = now();
  const logFile = path.join(
    logDir,
    `cycle-${String(cycle).padStart(3, "0")}-${startedAt.replace(/[:.]/g, "-")}.log`
  );

  console.log(`\n=== Night autonomy cycle ${cycle}/${cycles} ===`);
  console.log(`Log: ${logFile}`);

  const result = spawnSync("npm", ["run", "autonomy:cycle"], {
    encoding: "utf8",
    shell: false,
  });

  const output = [
    `ALAI Night Autonomy Cycle ${cycle}/${cycles}`,
    `Started: ${startedAt}`,
    `Finished: ${now()}`,
    `Exit status: ${result.status}`,
    "",
    "===== STDOUT =====",
    result.stdout || "",
    "",
    "===== STDERR =====",
    result.stderr || "",
  ].join("\n");

  fs.writeFileSync(logFile, output);

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.status !== 0) {
    failures++;
    console.error(`Cycle ${cycle} failed. Failures: ${failures}/${maxFailures}`);

    if (failures >= maxFailures) {
      console.error("Too many failures. Stopping night autonomy.");
      process.exit(result.status ?? 1);
    }
  } else {
    failures = 0;
    console.log(`Cycle ${cycle} completed successfully.`);
  }

  if (cycle < cycles) {
    console.log(`Sleeping ${sleepSeconds}s before next cycle...`);
    sleep(sleepSeconds * 1000);
  }
}

console.log("\nALAI Night Autonomy completed.");
console.log({ finishedAt: now() });

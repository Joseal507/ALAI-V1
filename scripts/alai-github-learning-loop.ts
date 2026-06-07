import { spawnSync } from "node:child_process";

const startedAt = Date.now();

const sessionMinutes = Number(process.env.ALAI_SESSION_MINUTES || 15);
const sleepSeconds = Number(process.env.ALAI_SLEEP_SECONDS || 60);
const maxCycles = Number(process.env.ALAI_MAX_CYCLES || 3);

const sessionMs = sessionMinutes * 60 * 1000;

const commands = [
  "npm run alai:architecture-lab",
  "npm run alai:architecture-experiment",
  "npm run alai:cognitive-test",
  "npm run alai:strict-mastery",
  "npm run alai:promote-mastered",
  "npm run model:health",
];

function run(command: string): boolean {
  console.log(`\n========== RUN: ${command} ==========`);

  const result = spawnSync(command, {
    shell: true,
    stdio: "inherit",
    env: process.env,
  });

  return result.status === 0;
}

function sleep(seconds: number): void {
  console.log(`\nSleeping ${seconds}s...`);
  spawnSync(`sleep ${seconds}`, { shell: true, stdio: "inherit" });
}

async function main() {
  console.log("ALAI GitHub learning loop started.");
  console.log({
    sessionMinutes,
    sleepSeconds,
    maxCycles,
    startedAt: new Date(startedAt).toISOString(),
  });

  for (let cycle = 1; cycle <= maxCycles; cycle++) {
    if (Date.now() - startedAt > sessionMs) {
      console.log("Session time reached. Stopping.");
      break;
    }

    console.log(`\n========== ALAI LEARNING CYCLE ${cycle}/${maxCycles} ==========`);

    for (const command of commands) {
      if (Date.now() - startedAt > sessionMs) {
        console.log("Session time reached during command loop. Stopping.");
        break;
      }

      const ok = run(command);

      if (!ok) {
        console.warn(`Command failed but loop will continue: ${command}`);
      }
    }

    if (cycle < maxCycles) sleep(sleepSeconds);
  }

  console.log("ALAI GitHub learning loop finished.");
}

main().catch((error) => {
  console.error("ALAI GitHub learning loop failed:");
  console.error(error);
  process.exit(1);
});

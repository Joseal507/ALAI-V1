import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";

const startedAt = Date.now();

const maxMinutes = Number(process.env.ALAI_DAEMON_MAX_MINUTES || 340);
const workMinutes = Number(process.env.ALAI_WORK_MINUTES || 15);
const sleepSeconds = Number(process.env.ALAI_SLEEP_SECONDS || 120);

const maxMs = maxMinutes * 60 * 1000;
const workMs = workMinutes * 60 * 1000;

type CommandPlan = {
  command: string;
  critical: boolean;
};

const commands: CommandPlan[] = [
  { command: "npm run alai:research-v2", critical: false },
  { command: "npm run alai:knowledge-expand", critical: false },
  { command: "npm run alai:evidence-backfill", critical: false },
  { command: "npm run alai:core-relations", critical: false },
  { command: "npm run alai:competency", critical: false },
  { command: "npm run alai:repair-competency-status", critical: false },
  { command: "npm run alai:promotion-v5", critical: false },
  { command: "npm run alai:canonical-alias-resolver", critical: false },
  { command: "npm run alai:question-concept-cleaner", critical: false },
  { command: "npm run alai:quality-flag-cleaner", critical: false },
  { command: "npm run alai:objective-3-final-audit", critical: true },
  { command: "npm run model:health", critical: true },
];

function panamaHour(): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Panama",
    hour: "numeric",
    hour12: false,
  }).formatToParts(new Date());

  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  return hour === 24 ? 0 : hour;
}

function isDayWindow(): boolean {
  const hour = panamaHour();
  return hour >= 6 && hour < 21;
}

function snapshot(label: string) {
  const db = new Database("data/alai.db");
  const row = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM concepts WHERE status IN ('VERIFIED','CANONICAL')) AS trusted,
      (SELECT COUNT(*) FROM concepts WHERE status!='REJECTED') AS active,
      ROUND(
        CAST((SELECT COUNT(*) FROM concepts WHERE status IN ('VERIFIED','CANONICAL')) AS REAL) /
        MAX(1,(SELECT COUNT(*) FROM concepts WHERE status!='REJECTED')),
        3
      ) AS trustedRatio,
      (SELECT COUNT(*) FROM concepts WHERE status='CANONICAL') AS canonical,
      (SELECT COUNT(*) FROM concepts WHERE status='VERIFIED') AS verified,
      (SELECT COUNT(*) FROM concepts WHERE status='PENDING') AS pending,
      (SELECT COUNT(*) FROM alai_quality_flags WHERE status='OPEN') AS openFlags,
      (SELECT COUNT(*) FROM concept_evidence_links) AS evidence,
      (SELECT COUNT(*) FROM relations) AS relations
  `).get();

  console.log(`\n========== ${label} SNAPSHOT ==========`);
  console.table([row]);
  db.close();
}

function run(command: string): boolean {
  console.log(`\n========== RUN: ${command} ==========`);
  const result = spawnSync(command, {
    shell: true,
    stdio: "inherit",
    env: process.env,
    timeout: 120_000,
  });

  if (result.error) {
    console.warn(`Command error: ${command}`, result.error.message);
  }

  return result.status === 0;
}

function sleep(seconds: number) {
  console.log(`\nSleeping ${seconds}s...`);
  spawnSync(`sleep ${seconds}`, { shell: true, stdio: "inherit" });
}

async function main() {
  console.log("ALAI GitHub DAY DAEMON started.");
  console.log({
    maxMinutes,
    workMinutes,
    sleepSeconds,
    panamaHour: panamaHour(),
    startedAt: new Date(startedAt).toISOString(),
  });

  snapshot("START");

  let block = 0;

  while (Date.now() - startedAt < maxMs && isDayWindow()) {
    block++;
    const blockStartedAt = Date.now();

    console.log(`\n========== DAY WORK BLOCK ${block} ==========`);

    while (
      Date.now() - blockStartedAt < workMs &&
      Date.now() - startedAt < maxMs &&
      isDayWindow()
    ) {
      for (const item of commands) {
        if (
          Date.now() - blockStartedAt >= workMs ||
          Date.now() - startedAt >= maxMs ||
          !isDayWindow()
        ) {
          break;
        }

        const ok = run(item.command);

        if (!ok) {
          const message = `Command failed: ${item.command}`;
          if (item.critical) {
            console.error(message);
            process.exit(1);
          }
          console.warn(`${message}. Continuing because it is non-critical.`);
        }
      }
    }

    snapshot(`AFTER BLOCK ${block}`);

    if (Date.now() - startedAt >= maxMs || !isDayWindow()) break;
    sleep(sleepSeconds);
  }

  snapshot("FINAL");
  console.log("ALAI GitHub DAY DAEMON finished.");
}

main().catch((error) => {
  console.error("ALAI GitHub DAY DAEMON failed:");
  console.error(error);
  process.exit(1);
});

import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";

const startedAt = Date.now();
const sessionMinutes = Number(process.env.ALAI_SESSION_MINUTES || 15);
const sleepSeconds = Number(process.env.ALAI_SLEEP_SECONDS || 120);
const sessionMs = sessionMinutes * 60 * 1000;

type CommandPlan = {
  command: string;
  critical: boolean;
  timeoutMs: number;
};

const commands: CommandPlan[] = [
  { command: "npm run alai:research-v2", critical: false, timeoutMs: 90_000 },
  { command: "npm run alai:knowledge-expand", critical: false, timeoutMs: 90_000 },
  { command: "npm run alai:evidence-backfill", critical: false, timeoutMs: 90_000 },
  { command: "npm run alai:core-relations", critical: false, timeoutMs: 90_000 },
  { command: "npm run alai:competency", critical: false, timeoutMs: 120_000 },
  { command: "npm run alai:repair-competency-status", critical: false, timeoutMs: 90_000 },
  { command: "npm run alai:promotion-v5", critical: false, timeoutMs: 90_000 },
  { command: "npm run alai:question-concept-cleaner", critical: false, timeoutMs: 90_000 },
  { command: "npm run alai:quality-flag-cleaner", critical: false, timeoutMs: 90_000 },
  { command: "npm run alai:objective-3-final-audit", critical: true, timeoutMs: 90_000 },
  { command: "npm run model:health", critical: true, timeoutMs: 90_000 },
];

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

function run(command: string, timeoutMs: number): boolean {
  if (Date.now() - startedAt >= sessionMs) {
    console.log(`Skipping ${command}: session time reached.`);
    return true;
  }

  console.log(`\n========== RUN: ${command} ==========`);

  const result = spawnSync(command, {
    shell: true,
    stdio: "inherit",
    env: process.env,
    timeout: timeoutMs,
  });

  if (result.error) {
    console.warn(`Command error: ${command}: ${result.error.message}`);
  }

  return result.status === 0;
}

function sleep(seconds: number) {
  console.log(`\n========== SLEEP ${seconds}s BEFORE EXIT ==========`);

  const remainingMs = Math.max(0, sessionMs + seconds * 1000 - (Date.now() - startedAt));
  const safeSleepSeconds = Math.min(seconds, Math.floor(remainingMs / 1000));

  if (safeSleepSeconds > 0) {
    spawnSync(`sleep ${safeSleepSeconds}`, { shell: true, stdio: "inherit" });
  }
}

async function main() {
  console.log("ALAI GitHub DAY single-cycle learning started.");
  console.log({
    sessionMinutes,
    sleepSeconds,
    startedAt: new Date(startedAt).toISOString(),
  });

  snapshot("BEFORE");

  let cycle = 0;

  while (Date.now() - startedAt < sessionMs) {
    cycle++;
    console.log(`\n========== DAY INNER CYCLE ${cycle} ==========`);

    for (const item of commands) {
      if (Date.now() - startedAt >= sessionMs) {
        console.log("Session time reached. Ending command loop.");
        break;
      }

      const ok = run(item.command, item.timeoutMs);

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

  snapshot("AFTER");
  sleep(sleepSeconds);
  snapshot("FINAL");

  console.log("ALAI GitHub DAY single-cycle learning finished.");
}

main().catch((error) => {
  console.error("ALAI GitHub DAY learning failed:");
  console.error(error);
  process.exit(1);
});

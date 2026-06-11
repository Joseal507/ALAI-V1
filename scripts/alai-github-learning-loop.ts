import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";

const startedAt = Date.now();

const sessionMinutes = Number(process.env.ALAI_SESSION_MINUTES || 18);
const sleepSeconds = Number(process.env.ALAI_SLEEP_SECONDS || 45);
const maxCycles = Number(process.env.ALAI_MAX_CYCLES || 2);
const sessionMs = sessionMinutes * 60 * 1000;

type CommandPlan = {
  command: string;
  critical: boolean;
};

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
      (SELECT COUNT(*) FROM concepts WHERE status='REJECTED') AS rejected,
      (SELECT COUNT(*) FROM alai_quality_flags WHERE status='OPEN') AS openFlags,
      (SELECT COUNT(*) FROM concept_evidence_links) AS evidence,
      (SELECT COUNT(*) FROM relations) AS relations
  `).get();

  console.log(`\n========== ${label} SNAPSHOT ==========`);
  console.table([row]);

  db.close();
}

const commands: CommandPlan[] = [
  { command: "npm run alai:research-v2", critical: false },
  { command: "npm run alai:autonomous-research", critical: false },
  { command: "npm run alai:knowledge-expand", critical: false },
  { command: "npm run alai:evidence-backfill", critical: false },
  { command: "npm run alai:core-relations", critical: false },
  { command: "npm run alai:graph-density", critical: false },
  { command: "npm run alai:reasoning-exam", critical: false },
  { command: "npm run alai:grounded-exam", critical: false },
  { command: "npm run alai:autonomous-exam", critical: false },
  { command: "npm run alai:competency", critical: false },
  { command: "npm run alai:repair-competency-status", critical: false },
  { command: "npm run alai:sync-competency", critical: false },
  { command: "npm run alai:strict-mastery", critical: false },
  { command: "npm run alai:promotion-v5", critical: false },
  { command: "npm run alai:canonical-alias-resolver", critical: false },
  { command: "npm run alai:question-concept-cleaner", critical: false },
  { command: "npm run alai:objective-3-final-audit", critical: true },
  { command: "npm run alai:quality-flag-cleaner", critical: false },
  { command: "npm run alai:real-rating", critical: true },
  { command: "npm run model:health", critical: true },
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
  console.log("ALAI GitHub governed hybrid learning loop started.");
  console.log({
    sessionMinutes,
    sleepSeconds,
    maxCycles,
    startedAt: new Date(startedAt).toISOString(),
  });

  snapshot("BEFORE");

  for (let cycle = 1; cycle <= maxCycles; cycle++) {
    if (Date.now() - startedAt > sessionMs) {
      console.log("Session time reached. Stopping.");
      break;
    }

    console.log(`\n========== ALAI GITHUB HYBRID CYCLE ${cycle}/${maxCycles} ==========`);

    for (const item of commands) {
      if (Date.now() - startedAt > sessionMs) {
        console.log("Session time reached during command loop. Stopping.");
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

    snapshot(`AFTER CYCLE ${cycle}`);

    if (cycle < maxCycles) sleep(sleepSeconds);
  }

  snapshot("FINAL");
  console.log("ALAI GitHub governed hybrid learning loop finished.");
}

main().catch((error) => {
  console.error("ALAI GitHub learning loop failed:");
  console.error(error);
  process.exit(1);
});

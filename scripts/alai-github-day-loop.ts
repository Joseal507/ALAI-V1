import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";

const startedAt = Date.now();
const sessionMinutes = Number(process.env.ALAI_SESSION_MINUTES || 8);
const maxCycles = Number(process.env.ALAI_MAX_CYCLES || 1);
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
      (SELECT COUNT(*) FROM alai_quality_flags WHERE status='OPEN') AS openFlags,
      (SELECT COUNT(*) FROM concept_evidence_links) AS evidence,
      (SELECT COUNT(*) FROM relations) AS relations
  `).get();

  console.log(`\\n========== ${label} SNAPSHOT ==========`);
  console.table([row]);
  db.close();
}

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

function run(command: string): boolean {
  if (Date.now() - startedAt > sessionMs) {
    console.log(`Skipping ${command}: session time reached.`);
    return true;
  }

  console.log(`\\n========== RUN: ${command} ==========`);
  const result = spawnSync(command, {
    shell: true,
    stdio: "inherit",
    env: process.env,
    timeout: 90_000,
  });

  if (result.error) {
    console.warn(`Command error: ${command}`, result.error.message);
  }

  return result.status === 0;
}

async function main() {
  console.log("ALAI GitHub DAY lightweight learning loop started.");
  console.log({
    sessionMinutes,
    maxCycles,
    startedAt: new Date(startedAt).toISOString(),
  });

  snapshot("BEFORE");

  for (let cycle = 1; cycle <= maxCycles; cycle++) {
    if (Date.now() - startedAt > sessionMs) break;

    console.log(`\\n========== ALAI GITHUB DAY CYCLE ${cycle}/${maxCycles} ==========`);

    for (const item of commands) {
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
  }

  snapshot("FINAL");
  console.log("ALAI GitHub DAY lightweight learning loop finished.");
}

main().catch((error) => {
  console.error("ALAI GitHub DAY learning loop failed:");
  console.error(error);
  process.exit(1);
});

import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";

const startedAt = Date.now();
const sessionMinutes = Number(process.env.ALAI_SESSION_MINUTES || 15);
const sleepSeconds = Number(process.env.ALAI_SLEEP_SECONDS || 30);
const maxCycles = Number(process.env.ALAI_MAX_CYCLES || 1);
const sessionMs = sessionMinutes * 60 * 1000;

type CommandPlan = {
  command: string;
  critical: boolean;
  timeoutMs: number;
};

const commands: CommandPlan[] = [
  { command: "npm run alai:v24-answer-regression", critical: true, timeoutMs: 240_000 },
  { command: "npm run alai:v27-research-regression", critical: true, timeoutMs: 180_000 },

  { command: "npm run alai:research-executor", critical: false, timeoutMs: 300_000 },
  { command: "npm run alai:research-auto-closer", critical: false, timeoutMs: 180_000 },
  { command: "npm run alai:research-gap-closer", critical: false, timeoutMs: 180_000 },

  { command: "npm run alai:cognitive-debt-governor", critical: false, timeoutMs: 180_000 },
  { command: "npm run alai:pending-promotion-v2", critical: false, timeoutMs: 180_000 },
  { command: "npm run alai:belief-system", critical: false, timeoutMs: 180_000 },
  { command: "npm run alai:belief-revision", critical: false, timeoutMs: 180_000 },
  { command: "npm run alai:episodic-experience", critical: false, timeoutMs: 120_000 },

  { command: "npm run alai:semantic-relation-grounding-v2", critical: false, timeoutMs: 300_000 },
  { command: "npm run alai:trace-court", critical: false, timeoutMs: 180_000 },
  { command: "npm run alai:path-quality", critical: false, timeoutMs: 180_000 },

  { command: "npm run alai:final-scale-readiness", critical: true, timeoutMs: 240_000 },
  { command: "npm run model:health", critical: true, timeoutMs: 120_000 },
  { command: "npm run alai:scale-metrics", critical: false, timeoutMs: 120_000 },
];

function snapshot(label: string) {
  const db = new Database("data/alai.db");
  const row = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM concepts) AS concepts,
      (SELECT COUNT(*) FROM concepts WHERE status='CANONICAL') AS canonical,
      (SELECT COUNT(*) FROM concepts WHERE status='VERIFIED') AS verified,
      (SELECT COUNT(*) FROM concepts WHERE status='PENDING') AS pending,
      (SELECT COUNT(*) FROM concepts WHERE status='REJECTED') AS rejected,
      (SELECT COUNT(*) FROM evidence) AS evidence,
      (SELECT COUNT(*) FROM concept_evidence_links) AS evidenceLinks,
      (SELECT COUNT(*) FROM relations) AS relations,
      (SELECT COUNT(*) FROM alai_research_questions WHERE status='OPEN') AS researchOpen,
      (SELECT COUNT(*) FROM alai_research_questions WHERE status='ANSWERED') AS researchAnswered,
      (SELECT COUNT(*) FROM alai_research_questions WHERE status='BLOCKED') AS researchBlocked,
      (SELECT COUNT(*) FROM knowledge_gaps WHERE status='OPEN') AS gapsOpen,
      (SELECT COUNT(*) FROM knowledge_gaps WHERE status='RESOLVED') AS gapsResolved
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
  const safeSleepSeconds = Math.max(0, Math.min(seconds, 60));
  if (safeSleepSeconds > 0) {
    console.log(`\n========== SLEEP ${safeSleepSeconds}s BEFORE EXIT ==========`);
    spawnSync(`sleep ${safeSleepSeconds}`, { shell: true, stdio: "inherit" });
  }
}

async function main() {
  console.log("ALAI GitHub DAY governed learning started.");
  console.log({
    sessionMinutes,
    sleepSeconds,
    maxCycles,
    startedAt: new Date(startedAt).toISOString(),
  });

  snapshot("BEFORE");

  for (let cycle = 1; cycle <= maxCycles; cycle++) {
    if (Date.now() - startedAt >= sessionMs) break;

    console.log(`\n========== DAY GOVERNED CYCLE ${cycle}/${maxCycles} ==========`);

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

  console.log("ALAI GitHub DAY governed learning finished.");
}

main().catch((error) => {
  console.error("ALAI GitHub DAY learning failed:");
  console.error(error);
  process.exit(1);
});

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const intervalMinutes = Number(process.env.ALAI_INTERVAL_MINUTES ?? "30");
const cyclesPerRun = Number(process.env.ALAI_CYCLES_PER_RUN ?? "1");
const maxBackups = Number(process.env.ALAI_MAX_BACKUPS ?? "20");

const root = process.cwd();
const dbPath = path.join(root, "data", "alai.db");
const backupDir = path.join(root, "data", "backups");
const logDir = path.join(root, "logs");

fs.mkdirSync(backupDir, { recursive: true });
fs.mkdirSync(logDir, { recursive: true });

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function backupDb() {
  if (!fs.existsSync(dbPath)) {
    console.warn("No data/alai.db found. Skipping backup.");
    return;
  }

  const target = path.join(backupDir, `alai-${stamp()}.db`);
  fs.copyFileSync(dbPath, target);
  console.log(`DB backup created: ${target}`);

  const backups = fs.readdirSync(backupDir)
    .filter((f) => f.startsWith("alai-") && f.endsWith(".db"))
    .map((f) => ({
      file: f,
      time: fs.statSync(path.join(backupDir, f)).mtimeMs,
    }))
    .sort((a, b) => b.time - a.time);

  for (const old of backups.slice(maxBackups)) {
    fs.unlinkSync(path.join(backupDir, old.file));
  }
}

function runCommand(label: string, command: string, args: string[], extraEnv: Record<string, string> = {}) {
  console.log(`\n=== ${label} ===\n`);

  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      ...extraEnv,
    },
  });

  if (result.status !== 0) {
    throw new Error(`${label} failed with status ${result.status}`);
  }
}

function runOnce() {
  console.log(`\n\n==============================`);
  console.log(`ALAI LOCAL RUN ${new Date().toISOString()}`);
  console.log(`==============================\n`);

  backupDb();

  runCommand("Typecheck", "npm", ["run", "typecheck"]);

  runCommand("Autonomous scheduler", "npm", ["run", "alai:auto"], {
    ALAI_CYCLES: String(cyclesPerRun),
  });

  runCommand("Curriculum report", "npm", ["run", "curriculum:report"]);
  runCommand("World model health", "npm", ["run", "model:health"]);

  console.log("\nALAI local run completed successfully.");
}

async function main() {
  console.log("ALAI local runner started.");
  console.log({
    intervalMinutes,
    cyclesPerRun,
    maxBackups,
  });

  while (true) {
    try {
      runOnce();
    } catch (error) {
      console.error("\nALAI local run failed:");
      console.error(error);
      console.error("Runner will continue after the interval.");
    }

    console.log(`\nSleeping ${intervalMinutes} minutes...\n`);
    await new Promise((resolve) => setTimeout(resolve, intervalMinutes * 60 * 1000));
  }
}

main();

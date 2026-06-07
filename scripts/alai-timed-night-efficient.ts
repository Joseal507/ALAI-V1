import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";

const db = new Database("data/alai.db");

const workMinutes = Number(process.env.ALAI_WORK_MINUTES || 15);
const sleepSeconds = Number(process.env.ALAI_SLEEP_SECONDS || 60);
const maxFailures = Number(process.env.ALAI_MAX_FAILURES || 3);

let stopped = false;
let failures = 0;
let cycle = 0;

process.on("SIGINT", () => {
  stopped = true;
  console.log("\nStopping safely after current step...");
});

function sleep(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function count(sql: string): number {
  try {
    return (db.prepare(sql).get() as { count: number }).count;
  } catch {
    return 0;
  }
}

function snapshot(label: string) {
  console.log(`\n=== ${label} ===`);
  console.table({
    concepts: count("SELECT COUNT(*) AS count FROM concepts"),
    pending: count("SELECT COUNT(*) AS count FROM concepts WHERE status='PENDING'"),
    verified: count("SELECT COUNT(*) AS count FROM concepts WHERE status='VERIFIED'"),
    canonical: count("SELECT COUNT(*) AS count FROM concepts WHERE status='CANONICAL'"),
    rejected: count("SELECT COUNT(*) AS count FROM concepts WHERE status='REJECTED'"),
    evidence: count("SELECT COUNT(*) AS count FROM evidence"),
    relations: count("SELECT COUNT(*) AS count FROM relations"),
    openQuestions: count("SELECT COUNT(*) AS count FROM alai_research_questions WHERE status='OPEN'"),
    answeredQuestions: count("SELECT COUNT(*) AS count FROM alai_research_questions WHERE status='ANSWERED'"),
    openFlags: count("SELECT COUNT(*) AS count FROM alai_quality_flags WHERE status='OPEN'"),
    duplicateRelations: count(`
      SELECT COUNT(*) AS count FROM (
        SELECT from_concept_id, to_concept_id, relation_type, COUNT(*) AS c
        FROM relations
        GROUP BY from_concept_id, to_concept_id, relation_type
        HAVING c > 1
      )
    `),
  });
}

function run(script: string, timeoutMs?: number) {
  if (stopped) return;

  console.log(`\n=== ${script} ===`);

  const result = spawnSync("npm", ["run", script], {
    stdio: "inherit",
    shell: false,
    timeout: timeoutMs,
    env: {
      ...process.env,
      ALAI_MAX_NEW_CONCEPTS_PER_RUN: process.env.ALAI_MAX_NEW_CONCEPTS_PER_RUN || "1",
      ALAI_MAX_NEW_RELATIONS_PER_RUN: process.env.ALAI_MAX_NEW_RELATIONS_PER_RUN || "10",
    },
  });

  if (result.status !== 0 && result.signal !== "SIGTERM") {
    failures++;
    console.error(`FAILED ${script}: ${failures}/${maxFailures}`);
  } else {
    failures = 0;
  }

  if (failures >= maxFailures) {
    console.error("Too many failures. Stopping.");
    process.exit(1);
  }
}

console.log("ALAI Efficient Timed Night started.");
console.log({
  workMinutes,
  sleepSeconds,
  maxNewConcepts: process.env.ALAI_MAX_NEW_CONCEPTS_PER_RUN || "1",
  maxNewRelations: process.env.ALAI_MAX_NEW_RELATIONS_PER_RUN || "10",
});

run("alai:prepare-night-learning");
run("alai:dedupe-relations-hard");
run("alai:resolve-contradictions");
run("alai:night-check");
run("alai:final-night-gate");

while (!stopped) {
  cycle++;
  const start = Date.now();
  const end = start + workMinutes * 60 * 1000;

  console.log(`\n==============================`);
  console.log(`WORK BLOCK ${cycle}: ${workMinutes} minutes`);
  console.log(`==============================`);

  snapshot("BEFORE WORK BLOCK");

  while (!stopped && Date.now() < end) {
    run("alai:purge-blocked");
    run("alai:research-executor", Math.max(30_000, end - Date.now()));
    run("knowledge:promote");
    run("alai:mastery");
    run("alai:promote-mastered");
    run("alai:dedupe-relations-hard");
    run("alai:resolve-contradictions");

    if (count("SELECT COUNT(*) AS count FROM alai_quality_flags WHERE status='OPEN'") > 0) {
      console.error("Open quality flags detected. Stopping for safety.");
      process.exit(1);
    }

    if (Date.now() < end) {
      sleep(10_000);
    }
  }

  run("model:health");
  snapshot("AFTER WORK BLOCK");

  if (stopped) break;

  console.log(`\nSleeping ${sleepSeconds}s. Ctrl+C to stop.`);
  sleep(sleepSeconds * 1000);
}

console.log("\nStopped safely.");
snapshot("FINAL");

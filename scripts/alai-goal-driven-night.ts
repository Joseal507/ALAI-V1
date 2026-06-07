import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";

const db = new Database("data/alai.db");

const cycles = Number(process.env.ALAI_NIGHT_CYCLES || 4);
const sleepSeconds = Number(process.env.ALAI_NIGHT_SLEEP_SECONDS || 180);

const coreTargets = [
  "vector",
  "scalar",
  "linear combination",
  "vector space",
  "basis",
  "dimension",
  "linear independence",
  "span",
  "writing",
  "reading",
  "basic arithmetic",
  "geometry",
  "angle measurement",
  "complementary angle",
];

function run(script: string) {
  console.log(`\n=== ${script} ===`);
  const result = spawnSync("npm", ["run", script], {
    stdio: "inherit",
    shell: false,
  });

  if (result.status !== 0) {
    console.error(`Step failed: ${script}`);
    process.exit(result.status ?? 1);
  }
}

function sleep(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function prioritizeGoalQuestions() {
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE alai_research_questions
    SET priority_score = 0.15,
        updated_at = ?
    WHERE status = 'OPEN'
  `).run(now);

  const result = db.prepare(`
    UPDATE alai_research_questions
    SET priority_score =
      CASE
        WHEN question_type = 'EVIDENCE_GAP' THEN 0.99
        WHEN question_type = 'RELATION_GAP' THEN 0.98
        WHEN question_type = 'MASTERY_GAP' THEN 0.97
        WHEN question_type = 'CAPABILITY_GAP' THEN 0.75
        ELSE 0.70
      END,
      updated_at = ?
    WHERE status = 'OPEN'
      AND concept_id IN (
        SELECT id FROM concepts
        WHERE lower(name) IN (${coreTargets.map(() => "?").join(",")})
      )
  `).run(now, ...coreTargets);

  console.log("Goal-driven questions prioritized.");
  console.log({ boosted: result.changes });
}

function printReport() {
  console.log("\n=== Goal Night Snapshot ===");

  console.table(db.prepare(`
    SELECT status, COUNT(*) AS count
    FROM concepts
    GROUP BY status
    ORDER BY status
  `).all());

  console.table(db.prepare(`
    SELECT status, COUNT(*) AS count
    FROM alai_research_questions
    GROUP BY status
    ORDER BY status
  `).all());

  console.table(db.prepare(`
    SELECT
      c.name,
      c.status,
      c.confidence_score,
      cm.mastery_score,
      cm.mastery_level
    FROM concepts c
    LEFT JOIN concept_mastery cm ON cm.concept_id = c.id
    WHERE lower(c.name) IN (${coreTargets.map(() => "?").join(",")})
    ORDER BY c.name
  `).all(...coreTargets));
}

console.log("ALAI Goal Driven Night started.");
console.log({ cycles, sleepSeconds });

run("alai:prepare-night-learning");

for (let i = 1; i <= cycles; i++) {
  console.log(`\n==============================`);
  console.log(`Goal cycle ${i}/${cycles}`);
  console.log(`==============================`);

  prioritizeGoalQuestions();

  run("alai:purge-blocked");
  run("alai:resolve-contradictions");
  run("alai:research-executor");
  run("alai:purge-blocked");
  run("knowledge:promote");
  run("alai:mastery");
  run("alai:promote-mastered");
  run("model:health");

  printReport();

  if (i < cycles) {
    console.log(`Sleeping ${sleepSeconds}s...`);
    sleep(sleepSeconds * 1000);
  }
}

console.log("\nALAI Goal Driven Night completed.");

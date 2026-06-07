import Database from "better-sqlite3";
import { spawnSync } from "node:child_process";

const db = new Database("data/alai.db");

const before = db.prepare(`
  SELECT
    (SELECT COUNT(*) FROM concepts WHERE status='PENDING') AS pending,
    (SELECT COUNT(*) FROM concepts WHERE status='VERIFIED') AS verified,
    (SELECT COUNT(*) FROM concepts WHERE status='CANONICAL') AS canonical,
    (SELECT COUNT(DISTINCT concept_id) FROM alai_autonomous_exams) AS autonomousExamConcepts,
    (
      SELECT COUNT(*)
      FROM concepts c
      JOIN alai_concept_competencies cc ON cc.concept_id = c.id
      WHERE c.id NOT IN (
        SELECT DISTINCT concept_id FROM alai_autonomous_exams
      )
    ) AS competencyWithoutExams
`).get();

function run(script: string) {
  console.log(`\n=== npm run ${script} ===`);
  const result = spawnSync("npm", ["run", script], {
    stdio: "inherit",
    shell: false,
  });

  if (result.status !== 0) {
    throw new Error(`Validation accelerator failed at ${script}`);
  }
}

console.log("ALAI validation accelerator started.");
console.log("Before:", before);

run("alai:self-test");
run("alai:autonomous-exam");
run("alai:competency");
run("alai:strict-mastery");
run("alai:promote-mastered");
run("alai:architecture-lab");

const after = db.prepare(`
  SELECT
    (SELECT COUNT(*) FROM concepts WHERE status='PENDING') AS pending,
    (SELECT COUNT(*) FROM concepts WHERE status='VERIFIED') AS verified,
    (SELECT COUNT(*) FROM concepts WHERE status='CANONICAL') AS canonical,
    (SELECT COUNT(DISTINCT concept_id) FROM alai_autonomous_exams) AS autonomousExamConcepts,
    (
      SELECT COUNT(*)
      FROM concepts c
      JOIN alai_concept_competencies cc ON cc.concept_id = c.id
      WHERE c.id NOT IN (
        SELECT DISTINCT concept_id FROM alai_autonomous_exams
      )
    ) AS competencyWithoutExams
`).get();

console.log("\nALAI validation accelerator completed.");
console.log("After:", after);

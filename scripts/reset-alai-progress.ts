import Database from "better-sqlite3";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

// 1️⃣ Reset mastery
db.prepare(`
  UPDATE concept_mastery
  SET mastery_score = 0,
      evidence_count = 0,
      relation_count = 0,
      contradiction_count = 0,
      last_calculated_at = NULL,
      updated_at = ?
`).run(now);

// 2️⃣ Clear curriculum coverage
db.prepare(`DELETE FROM curriculum_coverage`).run();
db.prepare(`DELETE FROM topic_coverage_rollup`).run();
db.prepare(`DELETE FROM domain_coverage_rollup`).run();
db.prepare(`DELETE FROM curriculum_completion`).run();

// 3️⃣ Reset growth stages (lock all except Academic Baby)
db.prepare(`
  UPDATE alai_growth_stage
  SET unlock_condition = unlock_condition,
      updated_at = ?
`).run(now);

console.log("ALAI progress has been reset. Concept mastery, coverage, rollups, and completion cleared.");

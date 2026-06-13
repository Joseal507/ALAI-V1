import Database from "better-sqlite3";

const db = new Database("data/alai.db");


db.exec(`
CREATE TABLE IF NOT EXISTS alai_v3_answer_runs (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  intent TEXT NOT NULL DEFAULT '',
  selected_concept TEXT,
  answer TEXT NOT NULL DEFAULT '',
  quality_score REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alai_v3_curriculum_executor_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  objectives_processed INTEGER NOT NULL DEFAULT 0,
  concepts_created INTEGER NOT NULL DEFAULT 0,
  questions_created INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'RUNNING'
);

CREATE TABLE IF NOT EXISTS alai_v3_domain_intelligence_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  domains_scored INTEGER NOT NULL DEFAULT 0,
  objectives_created INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'RUNNING'
);

CREATE TABLE IF NOT EXISTS alai_v3_domain_focus (
  id TEXT PRIMARY KEY,
  domain_id TEXT,
  domain_name TEXT NOT NULL,
  coverage_score REAL NOT NULL DEFAULT 0,
  urgency_score REAL NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alai_v3_conversation_self_learning_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  feedback_scanned INTEGER NOT NULL DEFAULT 0,
  research_created INTEGER NOT NULL DEFAULT 0,
  lessons_created INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'RUNNING'
);
`);

function n(sql: string): number {
  return Number((db.prepare(sql).get() as any)?.n ?? 0);
}

const snapshot = {
  v3Answers: n(`SELECT COUNT(*) AS n FROM alai_v3_answer_runs`),
  curriculumExecutorRuns: n(`SELECT COUNT(*) AS n FROM alai_v3_curriculum_executor_runs`),
  domainIntelligenceRuns: n(`SELECT COUNT(*) AS n FROM alai_v3_domain_intelligence_runs`),
  domainFocus: n(`SELECT COUNT(*) AS n FROM alai_v3_domain_focus`),
  conversationSelfLearningRuns: n(`SELECT COUNT(*) AS n FROM alai_v3_conversation_self_learning_runs`),
  curriculumObjectives: n(`SELECT COUNT(*) AS n FROM alai_v2_curriculum_full_study_queue`),
  masteryTasks: n(`SELECT COUNT(*) AS n FROM alai_v2_mastery_tasks`),
  openFlags: n(`SELECT COUNT(*) AS n FROM alai_quality_flags WHERE status='OPEN'`),
  openResearch: n(`SELECT COUNT(*) AS n FROM alai_research_questions WHERE status='OPEN'`),
  duplicateRelations: n(`
    SELECT COUNT(*) AS n FROM (
      SELECT from_concept_id,to_concept_id,relation_type,COUNT(*) c
      FROM relations GROUP BY from_concept_id,to_concept_id,relation_type
      HAVING c>1
    )
  `)
};

console.log("=== ALAI V3 READINESS AUDIT ===");
console.table([snapshot]);

const passed =
  snapshot.v3Answers >= 5 &&
  snapshot.curriculumExecutorRuns >= 1 &&
  snapshot.domainIntelligenceRuns >= 1 &&
  snapshot.domainFocus >= 5 &&
  snapshot.conversationSelfLearningRuns >= 1 &&
  snapshot.curriculumObjectives >= 100 &&
  snapshot.masteryTasks >= 1000 &&
  snapshot.openFlags === 0 &&
  snapshot.openResearch <= 20 &&
  snapshot.duplicateRelations === 0;

console.log({
  alaiV3Ready: passed,
  estimatedV3Score: passed ? 92 : 84
});

db.close();

if (!passed) process.exit(1);

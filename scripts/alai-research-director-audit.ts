import Database from "better-sqlite3";

const db = new Database("data/alai.db");

console.log("=== ALAI PHASE 5 RESEARCH AUTONOMY AUDIT ===");

const snapshot = db.prepare(`
SELECT
  (SELECT COUNT(*) FROM knowledge_gaps WHERE status='OPEN') AS openKnowledgeGaps,
  (SELECT COUNT(*) FROM knowledge_gaps WHERE status='RESOLVED') AS resolvedKnowledgeGaps,
  (SELECT COUNT(*) FROM knowledge_gaps WHERE status='BLOCKED') AS blockedKnowledgeGaps,
  (SELECT COUNT(*) FROM alai_research_questions WHERE status='OPEN') AS openResearchQuestions,
  (SELECT COUNT(*) FROM alai_research_questions WHERE status='ANSWERED') AS answeredResearchQuestions,
  (SELECT COUNT(*) FROM alai_research_questions WHERE status='BLOCKED') AS blockedResearchQuestions,
  (SELECT COUNT(*) FROM alai_research_questions WHERE status='REJECTED') AS rejectedResearchQuestions,
  (SELECT COUNT(*) FROM alai_research_director_runs) AS directorRuns,
  (SELECT COUNT(*) FROM alai_research_gap_links) AS gapQuestionLinks,
  (SELECT COUNT(*) FROM alai_research_answers) AS researchAnswers,
  (SELECT COUNT(*) FROM alai_quality_flags WHERE status='OPEN') AS openFlags
`).get();

console.table([snapshot]);

console.log("=== RECENT DIRECTOR RUNS ===");
console.table(db.prepare(`
SELECT
  started_at,
  gaps_scanned,
  questions_created,
  gaps_closed,
  gaps_blocked,
  status
FROM alai_research_director_runs
ORDER BY started_at DESC
LIMIT 10
`).all());

console.log("=== REMAINING OPEN GAPS SAMPLE ===");
console.table(db.prepare(`
SELECT
  kg.gap_description AS gap,
  kg.priority_score AS priority,
  c.name AS concept,
  c.status AS concept_status
FROM knowledge_gaps kg
LEFT JOIN concepts c ON c.id = kg.concept_id
WHERE kg.status='OPEN'
ORDER BY kg.priority_score DESC, kg.created_at ASC
LIMIT 30
`).all());

const row = snapshot as any;

const phase5Passed =
  row.openResearchQuestions === 0 &&
  row.openFlags === 0 &&
  row.directorRuns >= 1 &&
  row.gapQuestionLinks >= 1 &&
  row.researchAnswers >= 1 &&
  row.openKnowledgeGaps <= 100;

console.log("=== PHASE 5 STATUS ===");
console.log({
  phase5Passed,
  required: {
    openResearchQuestions: "0",
    openFlags: "0",
    directorRuns: ">= 1",
    gapQuestionLinks: ">= 1",
    researchAnswers: ">= 1",
    openKnowledgeGaps: "<= 100",
  },
});

db.close();

if (!phase5Passed) process.exit(1);

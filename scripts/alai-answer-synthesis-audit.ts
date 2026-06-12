import Database from "better-sqlite3";

const db = new Database("data/alai.db");

function n(sql: string): number {
  return Number((db.prepare(sql).get() as any)?.n ?? 0);
}

const snapshot = {
  runs: n(`
    SELECT COUNT(*) AS n
    FROM alai_answer_synthesis_runs
  `),

  beliefs: n(`
    SELECT COUNT(*) AS n
    FROM alai_beliefs
  `),

  concepts: n(`
    SELECT COUNT(*) AS n
    FROM concepts
    WHERE status IN ('CANONICAL','VERIFIED')
  `),

  openFlags: n(`
    SELECT COUNT(*) AS n
    FROM alai_quality_flags
    WHERE status='OPEN'
  `),

  openResearch: n(`
    SELECT COUNT(*) AS n
    FROM alai_research_questions
    WHERE status='OPEN'
  `)
};

console.log("=== ALAI ANSWER SYNTHESIS AUDIT ===");
console.table([snapshot]);

const passed =
  snapshot.beliefs >= 500 &&
  snapshot.concepts >= 1000 &&
  snapshot.openFlags === 0 &&
  snapshot.openResearch === 0;

console.log({ answerSynthesisInstalled: passed });

db.close();

if (!passed) process.exit(1);

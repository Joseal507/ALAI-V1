import Database from "better-sqlite3";

const db = new Database("data/alai.db");

function n(sql: string): number {
  return Number((db.prepare(sql).get() as any)?.n ?? 0);
}

const bad = n(`
SELECT COUNT(*) AS n
FROM alai_reasoning_traces
WHERE lower(public_reasoning) LIKE '%water utility%'
   OR lower(public_reasoning) LIKE '%preening%'
   OR lower(public_reasoning) LIKE '%schooling behavior%'
   OR lower(public_reasoning) LIKE '%solitary hunter%'
   OR lower(public_reasoning) LIKE '%aquatic locomotion%'
   OR lower(public_reasoning) LIKE '%adaptive radiation%'
   OR lower(public_reasoning) LIKE '%cat --%'
`);

const snapshot = {
  courtRuns: n(`SELECT COUNT(*) AS n FROM alai_reasoning_trace_court_runs`),
  verdicts: n(`SELECT COUNT(*) AS n FROM alai_reasoning_trace_verdicts`),
  traces: n(`SELECT COUNT(*) AS n FROM alai_reasoning_traces`),
  badTraces: bad,
  openFlags: n(`SELECT COUNT(*) AS n FROM alai_quality_flags WHERE status='OPEN'`),
  openResearch: n(`SELECT COUNT(*) AS n FROM alai_research_questions WHERE status='OPEN'`)
};

console.log("=== ALAI REASONING TRACE COURT AUDIT ===");
console.table([snapshot]);

const passed =
  snapshot.courtRuns >= 1 &&
  snapshot.verdicts >= 100 &&
  snapshot.badTraces === 0 &&
  snapshot.openFlags === 0 &&
  snapshot.openResearch === 0;

console.log({ reasoningTraceCourtPassed: passed });

db.close();

if (!passed) process.exit(1);

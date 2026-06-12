import Database from "better-sqlite3";

const db = new Database("data/alai.db");

const cache = db.prepare(`
SELECT COUNT(*) AS n
FROM alai_semantic_relevance_cache
`).get() as any;

const traces = db.prepare(`
SELECT COUNT(*) AS n
FROM alai_reasoning_traces
`).get() as any;

const beliefs = db.prepare(`
SELECT COUNT(*) AS n
FROM alai_beliefs
`).get() as any;

console.table([{
  semanticCache: cache.n,
  reasoningTraces: traces.n,
  beliefs: beliefs.n
}]);

const passed =
  cache.n >= 20 &&
  traces.n >= 100 &&
  beliefs.n >= 100;

console.log({
  semanticReasoningPassed: passed
});

db.close();

if (!passed) process.exit(1);

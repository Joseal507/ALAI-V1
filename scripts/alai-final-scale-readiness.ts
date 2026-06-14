import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";

const db = new Database("data/alai.db");

function n(sql: string) {
  try { return Number((db.prepare(sql).get() as any)?.n || 0); } catch { return 0; }
}

const checks = [
  "alai:v17-regression",
  "alai:v15-regression",
  "alai:v16-core",
  "alai:v12-bridges",
  "model:health"
];

let failed = 0;

for (const check of checks) {
  console.log(`\n========== ${check} ==========\n`);
  const r = spawnSync("npm", ["run", check], { stdio: "inherit", timeout: 180000 });
  if (r.status !== 0) failed++;
}

const snapshot = {
  concepts: n(`SELECT COUNT(*) AS n FROM concepts`),
  relations: n(`SELECT COUNT(*) AS n FROM relations`),
  beliefs: n(`SELECT COUNT(*) AS n FROM alai_beliefs`),
  v16Edges: n(`SELECT COUNT(*) AS n FROM alai_v16_graph_reasoning_edges WHERE status='ACTIVE'`),
  v17Runs: n(`SELECT COUNT(*) AS n FROM alai_v17_language_realizer_runs`),
  openFlags: n(`SELECT COUNT(*) AS n FROM alai_quality_flags WHERE status='OPEN'`),
  openResearch: n(`SELECT COUNT(*) AS n FROM alai_research_questions WHERE status='OPEN'`)
};

const ready =
  failed === 0 &&
  snapshot.concepts >= 7000 &&
  snapshot.relations >= 30000 &&
  snapshot.beliefs >= 500 &&
  snapshot.v16Edges >= 30 &&
  snapshot.openFlags === 0;

console.log("\n=== ALAI FINAL SCALE READINESS ===");
console.table([{ ...snapshot, failedChecks: failed, ready }]);

db.close();

if (!ready) process.exit(1);

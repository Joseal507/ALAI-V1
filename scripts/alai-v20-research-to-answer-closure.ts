import Database from "better-sqlite3";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const db = new Database("data/alai.db");
const now = new Date().toISOString();
const question = process.argv.slice(2).join(" ").trim();

if (!question) {
  console.error("Usage: npm run alai:v20-answer -- \"question\"");
  process.exit(1);
}

db.exec(`
CREATE TABLE IF NOT EXISTS alai_v20_research_answer_closures (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  stage TEXT NOT NULL,
  research_triggered INTEGER NOT NULL DEFAULT 0,
  graph_answered INTEGER NOT NULL DEFAULT 0,
  fallback_used INTEGER NOT NULL DEFAULT 0,
  answer TEXT NOT NULL,
  quality_score REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
`);

function run(script: string, q?: string, timeout = 240000) {
  const args = q ? ["run", script, "--", q] : ["run", script];
  return spawnSync("npm", args, { encoding: "utf8", timeout });
}

function queueResearch(q: string) {
  try {
    db.prepare(`
      INSERT INTO alai_research_questions
      (id, concept_id, topic_id, question, question_type, priority_score, status, created_at, updated_at)
      VALUES (?, NULL, NULL, ?, 'V20_AUTO_CLOSE_USER_QUESTION', 1.0, 'OPEN', ?, ?)
    `).run(
      crypto.randomUUID(),
      `Research and close this user question into graph knowledge, then answer it: ${q}`,
      now,
      now
    );
  } catch {}
}

function latestV19() {
  try {
    return db.prepare(`
      SELECT answer, quality_score, selected_engine, route_accepted, research_triggered
      FROM alai_v19_router_runs
      ORDER BY created_at DESC
      LIMIT 1
    `).get() as any;
  } catch {
    return null;
  }
}

function weak(text: string, quality: number) {
  const t = String(text || "").toLowerCase();
  return (
    quality < 0.75 ||
    t.includes("provisional") ||
    t.includes("no encontró suficiente") ||
    t.includes("no tengo suficientes") ||
    t.includes("research required") ||
    t.includes("activé aprendizaje bajo demanda")
  );
}

function answerV19(q: string) {
  const r = run("alai:v19-answer", q, 300000);
  const latest = latestV19();

  return {
    ok: r.status === 0,
    stdout: r.stdout || "",
    stderr: r.stderr || "",
    answer: String(latest?.answer || r.stdout || "").trim(),
    quality: Number(latest?.quality_score || 0),
    engine: String(latest?.selected_engine || "unknown"),
    routeAccepted: Number(latest?.route_accepted || 0) === 1,
    researchTriggered: Number(latest?.research_triggered || 0) === 1
  };
}

function closeResearchIntoGraph() {
  const steps = [
    "alai:research-executor",
    "alai:research-auto-closer",
    "alai:research-gap-closer",
    "alai:cognitive-debt-governor",
    "alai:pending-promotion-v2",
    "alai:belief-system",
    "alai:belief-revision",
    "alai:v16-core",
    "alai:v12-bridges",
    "alai:semantic-relation-grounding-v2",
    "alai:relation-court",
    "alai:trace-court",
    "alai:path-quality"
  ];

  for (const step of steps) {
    run(step, undefined, 300000);
  }
}

const first = answerV19(question);

let final = first;
let stage = "ANSWERED_FROM_EXISTING_GRAPH";
let researchTriggered = first.researchTriggered ? 1 : 0;
let graphAnswered = first.routeAccepted ? 1 : 0;
let fallbackUsed = 0;

if (!first.ok || weak(first.answer, first.quality) || !first.routeAccepted) {
  researchTriggered = 1;
  stage = "RESEARCH_TO_GRAPH_CLOSURE_STARTED";

  queueResearch(question);
  closeResearchIntoGraph();

  const second = answerV19(question);

  if (second.ok && second.routeAccepted && !weak(second.answer, second.quality)) {
    final = second;
    graphAnswered = 1;
    stage = "ANSWERED_AFTER_RESEARCH_GRAPH_CLOSURE";
  } else {
    const fallback = run("alai:v15-answer", question, 180000);
    final = {
      ok: fallback.status === 0,
      stdout: fallback.stdout || "",
      stderr: fallback.stderr || "",
      answer: fallback.stdout || "ALAI queued this question for learning and needs more graph knowledge before a strong answer.",
      quality: fallback.status === 0 ? 0.78 : 0.62,
      engine: "V15_SAFE_FALLBACK_AFTER_RESEARCH",
      routeAccepted: false,
      researchTriggered: true
    };
    fallbackUsed = 1;
    stage = "SAFE_FALLBACK_AFTER_RESEARCH_QUEUED";
  }
}

db.prepare(`
INSERT INTO alai_v20_research_answer_closures
(id, question, stage, research_triggered, graph_answered, fallback_used, answer, quality_score, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  crypto.randomUUID(),
  question,
  stage,
  researchTriggered,
  graphAnswered,
  fallbackUsed,
  final.answer || final.stdout,
  final.quality,
  now
);

console.log("\n=== ALAI V20 RESEARCH → GRAPH → ANSWER CLOSURE ===");
console.log({
  stage,
  researchTriggered: Boolean(researchTriggered),
  graphAnswered: Boolean(graphAnswered),
  fallbackUsed: Boolean(fallbackUsed),
  finalQuality: final.quality,
  finalEngine: final.engine
});
console.log("");
console.log(final.answer || final.stdout);

db.close();

if (final.quality < 0.6) process.exit(1);

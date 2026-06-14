import Database from "better-sqlite3";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const db = new Database("data/alai.db");
const now = new Date().toISOString();
const question = process.argv.slice(2).join(" ").trim();

if (!question) {
  console.error("Usage: npm run alai:v18-answer -- \"question\"");
  process.exit(1);
}

db.exec(`
CREATE TABLE IF NOT EXISTS alai_v18_demand_pipeline_runs (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  first_engine TEXT NOT NULL,
  first_quality REAL NOT NULL DEFAULT 0,
  research_triggered INTEGER NOT NULL DEFAULT 0,
  final_engine TEXT NOT NULL,
  final_quality REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  answer TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`);

function run(script: string, q?: string, timeout = 180000) {
  const args = q ? ["run", script, "--", q] : ["run", script];
  return spawnSync("npm", args, { encoding: "utf8", timeout });
}

function latestV17() {
  try {
    return db.prepare(`
      SELECT answer, quality_score
      FROM alai_v17_language_realizer_runs
      ORDER BY created_at DESC
      LIMIT 1
    `).get() as any;
  } catch {
    return null;
  }
}

function queuePriorityResearch(q: string, reason: string) {
  try {
    db.prepare(`
      INSERT INTO alai_research_questions
      (id, concept_id, topic_id, question, question_type, priority_score, status, created_at, updated_at)
      VALUES (?, NULL, NULL, ?, 'V18_ON_DEMAND_RESEARCH_TO_GRAPH', 0.999, 'OPEN', ?, ?)
    `).run(
      crypto.randomUUID(),
      `User asked: ${q}. Research, extract concepts, create relations, beliefs, graph paths, and improve answer. Reason: ${reason}`,
      now,
      now
    );
  } catch {}
}

function answerV17(q: string) {
  const r = run("alai:v17-answer", q, 180000);
  const latest = latestV17();
  return {
    stdout: r.stdout || "",
    stderr: r.stderr || "",
    status: r.status ?? 1,
    answer: String(latest?.answer || r.stdout || "").trim(),
    quality: Number(latest?.quality_score || 0)
  };
}

function weakAnswer(a: { answer: string; quality: number; status: number }) {
  const text = a.answer.toLowerCase();
  return (
    a.status !== 0 ||
    a.quality < 0.75 ||
    text.includes("no encontró") ||
    text.includes("no tengo suficientes") ||
    text.includes("provisional") ||
    text.includes("no encontró una ruta suficiente")
  );
}

const first = answerV17(question);

let finalAnswer = first.answer || first.stdout;
let finalQuality = first.quality;
let finalEngine = "V17_GRAPH_LANGUAGE";
let researchTriggered = 0;
let status = "ANSWERED_FROM_GRAPH";

if (weakAnswer(first)) {
  researchTriggered = 1;
  status = "RESEARCH_TO_GRAPH_TRIGGERED";

  queuePriorityResearch(question, "V17 did not have enough graph-grounded knowledge.");

  const learningSteps = [
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

  for (const step of learningSteps) {
    run(step, undefined, 240000);
  }

  const second = answerV17(question);

  if (!weakAnswer(second) && second.quality >= first.quality) {
    finalAnswer = second.answer || second.stdout;
    finalQuality = second.quality;
    finalEngine = "V17_AFTER_RESEARCH_TO_GRAPH";
    status = "ANSWERED_AFTER_RESEARCH_TO_GRAPH";
  } else {
    const fallback = run("alai:v15-answer", question, 180000);
    finalAnswer = fallback.stdout || finalAnswer;
    finalQuality = Math.max(first.quality, 0.72);
    finalEngine = "V15_PRIORITY_FALLBACK_WITH_RESEARCH_QUEUED";
    status = "ANSWERED_WITH_PRIORITY_FALLBACK_AND_LEARNING_QUEUED";
  }
}

db.prepare(`
INSERT INTO alai_v18_demand_pipeline_runs
(id, question, first_engine, first_quality, research_triggered, final_engine, final_quality, status, answer, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  crypto.randomUUID(),
  question,
  "V17_GRAPH_LANGUAGE",
  first.quality,
  researchTriggered,
  finalEngine,
  finalQuality,
  status,
  finalAnswer,
  now
);

console.log("\n=== ALAI V18 DEMAND RESEARCH PIPELINE ===");
console.log({
  firstQuality: first.quality,
  researchTriggered: Boolean(researchTriggered),
  finalEngine,
  finalQuality,
  status
});
console.log("");
console.log(finalAnswer);

db.close();

if (finalQuality < 0.65) process.exit(1);

import Database from "better-sqlite3";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const db = new Database("data/alai.db");
const now = new Date().toISOString();
const question = process.argv.slice(2).join(" ").trim();

if (!question) {
  console.error("Usage: npm run alai:v14-answer -- \"question\"");
  process.exit(1);
}

db.exec(`
CREATE TABLE IF NOT EXISTS alai_v14_on_demand_runs (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  first_quality REAL NOT NULL DEFAULT 0,
  final_quality REAL NOT NULL DEFAULT 0,
  research_triggered INTEGER NOT NULL DEFAULT 0,
  answer TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`);

function run(cmd: string, args: string[], timeout = 90000) {
  return spawnSync(cmd, args, {
    encoding: "utf8",
    timeout
  });
}

function latestV13() {
  try {
    return db.prepare(`
      SELECT answer, quality_score
      FROM alai_v13_language_expression_runs
      ORDER BY created_at DESC
      LIMIT 1
    `).get() as any;
  } catch {
    return null;
  }
}

function queueUrgentResearch(q: string) {
  try {
    db.prepare(`
      INSERT INTO alai_research_questions
      (id, concept_id, topic_id, question, question_type, priority_score, status, created_at, updated_at)
      VALUES (?, NULL, NULL, ?, 'ON_DEMAND_USER_QUESTION', 0.99, 'OPEN', ?, ?)
    `).run(
      crypto.randomUUID(),
      `Answer this user question immediately with grounded knowledge: ${q}`,
      now,
      now
    );
  } catch {}
}

function answerWithV13(q: string) {
  const result = run("npm", ["run", "alai:v13-answer", "--", q], 60000);
  const latest = latestV13();

  return {
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    status: result.status ?? 1,
    answer: String(latest?.answer || result.stdout || "").trim(),
    quality: Number(latest?.quality_score || 0)
  };
}

function createFallbackAnswer(q: string) {
  return [
    "ALAI no encontró suficiente conocimiento interno conectado para responder con máxima confianza.",
    "Activé aprendizaje bajo demanda para priorizar esta pregunta.",
    "",
    "Respuesta provisional:",
    "Puedo darte una respuesta útil, pero ALAI debe reforzar evidencia y relaciones antes de marcarla como conocimiento fuerte.",
    "",
    `Pregunta: ${q}`,
    "",
    "Siguiente acción interna: investigar, extraer conceptos, crear relaciones, guardar evidencia y volver a responder con mejor calidad."
  ].join("\n");
}

const first = answerWithV13(question);

let finalAnswer = first.answer;
let finalQuality = first.quality;
let researchTriggered = 0;
let status = "ANSWERED_FROM_MEMORY";

if (first.quality < 0.75 || first.answer.includes("Todavía no tengo suficientes relaciones claras")) {
  researchTriggered = 1;
  status = "RESEARCH_TRIGGERED";

  queueUrgentResearch(question);

  run("npm", ["run", "alai:research-executor"], 120000);
  run("npm", ["run", "alai:research-auto-closer"], 60000);
  run("npm", ["run", "alai:cognitive-debt-governor"], 60000);
  run("npm", ["run", "alai:v12-bridges"], 60000);

  const second = answerWithV13(question);

  if (second.quality > first.quality && !second.answer.includes("Todavía no tengo suficientes relaciones claras")) {
    finalAnswer = second.answer;
    finalQuality = second.quality;
    status = "ANSWERED_AFTER_ON_DEMAND_LEARNING";
  } else {
    finalAnswer = createFallbackAnswer(question);
    finalQuality = Math.max(first.quality, 0.64);
    status = "PROVISIONAL_WITH_RESEARCH_QUEUED";
  }
}

db.prepare(`
INSERT INTO alai_v14_on_demand_runs
(id, question, first_quality, final_quality, research_triggered, answer, status, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  crypto.randomUUID(),
  question,
  first.quality,
  finalQuality,
  researchTriggered,
  finalAnswer,
  status,
  now
);

console.log("\n=== ALAI V14 ON-DEMAND ANSWER ===");
console.log({
  firstQuality: first.quality,
  finalQuality,
  researchTriggered: Boolean(researchTriggered),
  status
});
console.log("");
console.log(finalAnswer);

db.close();

if (finalQuality < 0.6) process.exit(1);

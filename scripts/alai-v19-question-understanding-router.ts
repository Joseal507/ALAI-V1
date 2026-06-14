import Database from "better-sqlite3";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const db = new Database("data/alai.db");
const now = new Date().toISOString();
const question = process.argv.slice(2).join(" ").trim();

if (!question) {
  console.error("Usage: npm run alai:v19-answer -- \"question\"");
  process.exit(1);
}

db.exec(`
CREATE TABLE IF NOT EXISTS alai_v19_router_runs (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  detected_entities TEXT NOT NULL,
  selected_engine TEXT NOT NULL,
  route_accepted INTEGER NOT NULL DEFAULT 0,
  research_triggered INTEGER NOT NULL DEFAULT 0,
  answer TEXT NOT NULL,
  quality_score REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
`);

function norm(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const stop = new Set([
  "que","quien","quién","es","una","uno","un","la","el","los","las","de","del",
  "con","para","sirve","explica","explicame","relacion","relación","existe",
  "entre","porque","por","como","cómo","importante","en","y","o","a","se",
  "puede","afectar","saber","estudiar"
]);

function terms(s: string) {
  return norm(s).split(" ").filter(t => t.length > 2 && !stop.has(t));
}

function rows<T=any>(sql: string, params: any[] = []): T[] {
  try { return db.prepare(sql).all(...params) as T[]; } catch { return []; }
}

function get<T=any>(sql: string, params: any[] = []): T | null {
  try { return db.prepare(sql).get(...params) as T; } catch { return null; }
}

function run(script: string, q?: string, timeout = 180000) {
  const args = q ? ["run", script, "--", q] : ["run", script];
  return spawnSync("npm", args, { encoding: "utf8", timeout });
}

function queueResearch(reason: string) {
  try {
    db.prepare(`
      INSERT INTO alai_research_questions
      (id, concept_id, topic_id, question, question_type, priority_score, status, created_at, updated_at)
      VALUES (?, NULL, NULL, ?, 'V19_ROUTER_RESEARCH_REQUIRED', 0.999, 'OPEN', ?, ?)
    `).run(
      crypto.randomUUID(),
      `Research required before answering. User question: ${question}. Reason: ${reason}`,
      now,
      now
    );
  } catch {}
}

const qNorm = norm(question);
const qTerms = terms(question);

const concepts = rows(`
SELECT name, description, status
FROM concepts
WHERE status IN ('CANONICAL','VERIFIED','PENDING')
LIMIT 20000
`);

function conceptScore(c: any) {
  const name = String(c.name || "");
  const cNorm = norm(name);
  const cTerms = terms(name);
  let score = 0;

  if (!cNorm) return -9999;

  if (qNorm.includes(cNorm)) score += 1000 + cTerms.length * 80;

  const overlap = cTerms.filter((t:string) => qTerms.includes(t)).length;
  score += overlap * 120;

  if (cTerms.length > 1 && overlap >= 2) score += 250;

  if (String(c.status) === "CANONICAL") score += 40;
  if (String(c.status) === "VERIFIED") score += 35;
  if (String(c.status) === "PENDING") score -= 50;

  if (cTerms.length === 1 && qTerms.length >= 3 && overlap === 1 && !qNorm.includes(cNorm)) {
    score -= 250;
  }

  return score;
}

const detected = concepts
  .map(c => ({ name: c.name, score: conceptScore(c), status: c.status }))
  .filter(c => c.score >= 180)
  .sort((a,b)=>b.score-a.score)
  .slice(0, 8);

function latestV17Path() {
  try {
    return db.prepare(`
      SELECT path_json, answer, quality_score
      FROM alai_v17_language_realizer_runs
      ORDER BY created_at DESC
      LIMIT 1
    `).get() as any;
  } catch {
    return null;
  }
}

function pathMatchesQuestion(path: any[], entities: any[]) {
  if (!path.length) return false;

  const pathNodes = new Set<string>();
  for (const e of path) {
    pathNodes.add(norm(e.source_name || ""));
    pathNodes.add(norm(e.target_name || ""));
  }

  const entityNames = entities.map(e => norm(e.name));

  if (entityNames.length === 0) return false;

  const matched = entityNames.some(e => pathNodes.has(e));

  const questionText = qTerms.join(" ");
  const pathText = [...pathNodes].join(" ");

  const termOverlap = qTerms.filter(t => pathText.includes(t)).length;

  return matched && termOverlap >= Math.min(2, Math.max(1, qTerms.length));
}

function safePriorityAnswer() {
  const r = run("alai:v15-answer", question, 180000);
  return {
    status: r.status ?? 1,
    text: r.stdout || r.stderr || "",
    quality: r.status === 0 ? 0.82 : 0.55
  };
}

function researchThenRetry() {
  queueResearch("No safe matching graph path for question entities.");

  // Do not run heavy learning inline inside user answers.
  // V19 only queues research. The scale-feeding worker closes it safely.
  const steps: string[] = [];
  for (const step of steps) run(step, undefined, 240000);
}

let selectedEngine = "V17_GRAPH_LANGUAGE";
let routeAccepted = false;
let researchTriggered = false;
let answer = "";
let quality = 0;

const v17 = run("alai:v17-answer", question, 180000);
const latest = latestV17Path();

let path: any[] = [];
try { path = JSON.parse(latest?.path_json || "[]"); } catch {}

if (v17.status === 0 && pathMatchesQuestion(path, detected)) {
  routeAccepted = true;
  answer = v17.stdout || latest?.answer || "";
  quality = Number(latest?.quality_score || 0.8);
} else {
  researchTriggered = true;
  selectedEngine = "RESEARCH_TO_GRAPH_THEN_PRIORITY";
  researchThenRetry();

  const retry = run("alai:v17-answer", question, 180000);
  const retryLatest = latestV17Path();

  let retryPath: any[] = [];
  try { retryPath = JSON.parse(retryLatest?.path_json || "[]"); } catch {}

  if (retry.status === 0 && pathMatchesQuestion(retryPath, detected)) {
    routeAccepted = true;
    selectedEngine = "V17_AFTER_RESEARCH_TO_GRAPH";
    answer = retry.stdout || retryLatest?.answer || "";
    quality = Number(retryLatest?.quality_score || 0.8);
  } else {
    const fallback = safePriorityAnswer();
    selectedEngine = "V15_PRIORITY_SAFE_FALLBACK";
    answer = fallback.text || [
      "ALAI detectó que no tiene una ruta segura para responder esta pregunta todavía.",
      "La pregunta fue enviada a investigación prioritaria para crear conceptos, relaciones, creencias y rutas de grafo antes de responder como conocimiento fuerte."
    ].join("\n");
    quality = fallback.quality;
  }
}

db.prepare(`
INSERT INTO alai_v19_router_runs
(id, question, detected_entities, selected_engine, route_accepted, research_triggered, answer, quality_score, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  crypto.randomUUID(),
  question,
  JSON.stringify(detected),
  selectedEngine,
  routeAccepted ? 1 : 0,
  researchTriggered ? 1 : 0,
  answer,
  quality,
  now
);

console.log("\n=== ALAI V19 QUESTION UNDERSTANDING ROUTER ===");
console.log({
  detectedEntities: detected.map(e => e.name),
  selectedEngine,
  routeAccepted,
  researchTriggered,
  quality
});
console.log("");
console.log(answer);

db.close();

if (quality < 0.55) process.exit(1);

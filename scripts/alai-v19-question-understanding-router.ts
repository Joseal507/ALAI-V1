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
  "que","quien","quién","es","son","sea","una","uno","un","la","el","los","las",
  "de","del","con","para","sirve","explica","explicame","relacion","relación",
  "existe","entre","porque","por","como","cómo","importante","en","y","o","a",
  "se","puede","pueden","afectar","saber","estudiar","dime","define","definicion",
  "cuál","cual","cuáles","cuales","sobre","acerca","esto","eso"
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

function cleanQuestionPhrase(q: string) {
  const t = terms(q);
  return t.join(" ").trim();
}

function titleCaseFromNorm(s: string) {
  return s
    .split(" ")
    .filter(Boolean)
    .map(w => w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

function ensureConcept(name: string, description: string) {
  const n = norm(name);
  if (!n || n.length < 3) return null;

  const existing = get<any>(`
    SELECT id, name, status
    FROM concepts
    WHERE lower(name) = lower(?)
    LIMIT 1
  `, [name]);

  if (existing?.id) return existing;

  const id = crypto.randomUUID();
  try {
    db.prepare(`
      INSERT INTO concepts (id, name, description, status, confidence_score, created_at, updated_at)
      VALUES (?, ?, ?, 'PENDING', 0.62, ?, ?)
    `).run(id, name, description, now, now);
  } catch {
    return get<any>(`
      SELECT id, name, status
      FROM concepts
      WHERE lower(name) = lower(?)
      LIMIT 1
    `, [name]);
  }

  return { id, name, status: "PENDING" };
}

function queueResearch(reason: string, targetName?: string) {
  try {
    db.prepare(`
      INSERT INTO alai_research_questions
      (id, concept_id, topic_id, question, question_type, priority_score, status, created_at, updated_at)
      VALUES (?, NULL, NULL, ?, 'V19_ROUTER_RESEARCH_REQUIRED', 0.999, 'OPEN', ?, ?)
    `).run(
      crypto.randomUUID(),
      `${targetName ?? cleanQuestionPhrase(question)}`,
      now,
      now
    );
  } catch {}
}

const qNorm = norm(question);
const qTerms = terms(question);

const concepts = rows(`
SELECT id, name, description, status
FROM concepts
WHERE status IN ('CANONICAL','VERIFIED','PENDING')
LIMIT 50000
`);

function conceptScore(c: any) {
  const name = String(c.name || "");
  const cNorm = norm(name);
  const cTerms = terms(name);
  let score = 0;

  if (!cNorm) return -9999;

  if (qNorm.includes(cNorm)) score += 1200 + cTerms.length * 120;

  const overlap = cTerms.filter((t:string) => qTerms.includes(t)).length;
  score += overlap * 120;

  if (cTerms.length > 1 && overlap >= 2) score += 400;
  if (cTerms.length > 2 && overlap >= 3) score += 500;

  if (String(c.status) === "CANONICAL") score += 40;
  if (String(c.status) === "VERIFIED") score += 35;
  if (String(c.status) === "PENDING") score -= 20;

  if (cTerms.length === 1 && qTerms.length >= 3 && overlap === 1 && !qNorm.includes(cNorm)) {
    score -= 450;
  }

  return score;
}

function makeNgrams(tokens: string[]) {
  const grams: string[] = [];
  for (let n = Math.min(5, tokens.length); n >= 2; n--) {
    for (let i = 0; i <= tokens.length - n; i++) {
      grams.push(tokens.slice(i, i + n).join(" "));
    }
  }
  return grams;
}

const scoredDetected = concepts
  .map(c => ({ id: c.id, name: c.name, score: conceptScore(c), status: c.status }))
  .filter(c => c.score >= 220)
  .sort((a,b)=>b.score-a.score);

const ngrams = makeNgrams(qTerms);
const exactNgramConcepts = ngrams.map(g => {
  const match = concepts.find((c:any) => norm(c.name) === g);
  if (match) return { id: match.id, name: match.name, score: 2000 + terms(match.name).length * 100, status: match.status };
  return null;
}).filter(Boolean) as any[];

let syntheticConcept: any = null;
const bestPhrase = ngrams[0] || cleanQuestionPhrase(question);
if (bestPhrase && bestPhrase.split(" ").length >= 2) {
  const hasExact = exactNgramConcepts.some(e => norm(e.name) === bestPhrase);
  const bestExisting = scoredDetected[0];
  const bestExistingTerms = bestExisting ? terms(bestExisting.name).length : 0;

  if (!hasExact && (!bestExisting || bestExistingTerms < Math.min(2, qTerms.length))) {
    const syntheticName = titleCaseFromNorm(bestPhrase);
    syntheticConcept = ensureConcept(
      syntheticName,
      `Concepto compuesto detectado automáticamente desde la pregunta del usuario: "${question}". Requiere investigación y grounding antes de usarlo como conocimiento fuerte.`
    );
  }
}

const detected = [
  ...exactNgramConcepts,
  ...(syntheticConcept ? [{ id: syntheticConcept.id, name: syntheticConcept.name, score: 1800, status: syntheticConcept.status }] : []),
  ...scoredDetected
]
.filter((v, i, arr) => arr.findIndex(x => norm(x.name) === norm(v.name)) === i)
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
  if (!entities.length) return false;

  const pathNodes = new Set<string>();
  for (const e of path) {
    pathNodes.add(norm(e.source_name || ""));
    pathNodes.add(norm(e.target_name || ""));
  }

  const pathText = [...pathNodes].join(" ");
  const importantTerms = qTerms.filter(t => !["vida","basica","basico"].includes(t));
  const entityTerms = entities.flatMap(e => terms(e.name));
  const specificTerms = [...new Set([...importantTerms, ...entityTerms])];

  const overlap = specificTerms.filter(t => pathText.includes(t)).length;
  const hasEntity = entities.some(e => pathNodes.has(norm(e.name)));

  const topEntityTerms = terms(entities[0]?.name || "");
  const topSpecificMissing = topEntityTerms.length >= 2 && topEntityTerms.some(t => !pathText.includes(t));

  if (topSpecificMissing && !hasEntity) return false;

  return hasEntity || overlap >= Math.min(3, Math.max(2, specificTerms.length));
}

function safePriorityAnswer() {
  const specific = run("alai:v24-specific-answer", question, 120000);
  if (specific.status === 0 && !String(specific.stdout || "").includes("NO_SPECIFIC_ANSWER")) {
    return {
      status: 0,
      text: specific.stdout || "",
      quality: 0.9
    };
  }

  const r = run("alai:v15-answer", question, 180000);
  return {
    status: r.status ?? 1,
    text: r.stdout || r.stderr || "",
    quality: r.status === 0 ? 0.72 : 0.50
  };
}

function researchThenRetry() {
  const target = detected[0]?.name || cleanQuestionPhrase(question);
  queueResearch("No safe matching graph path for the specific question entities.", target);
}

let selectedEngine = "V17_GRAPH_LANGUAGE";
let routeAccepted = false;
let researchTriggered = false;
let answer = "";
let quality = 0;

const hasSpecificCompound = detected.some(e => terms(e.name).length >= 2);
const v17 = run("alai:v17-answer", question, 180000);
const latest = latestV17Path();

let path: any[] = [];
try { path = JSON.parse(latest?.path_json || "[]"); } catch {}

const topEntity = detected[0];
const topEntityTerms = terms(topEntity?.name || "");
const topEntityIsCompound = topEntityTerms.length >= 2;

const pathText = (() => {
  try {
    return path.map((p:any) =>
      `${p.source_name || ""} ${p.target_name || ""}`
    ).join(" ").toLowerCase();
  } catch {
    return "";
  }
})();

const compoundCovered =
  !topEntityIsCompound ||
  (
    pathText.includes(norm(topEntity?.name || "")) &&
    topEntityTerms.every((t:string) =>
      pathText.includes(t.toLowerCase())
    )
  );

if (
  v17.status === 0 &&
  pathMatchesQuestion(path, detected) &&
  compoundCovered
) {
  routeAccepted = true;
  answer = v17.stdout || latest?.answer || "";
  quality = Number(latest?.quality_score || 0.8);
} else {
  researchTriggered = true;
  selectedEngine = "RESEARCH_QUEUED_FOR_SPECIFIC_ENTITY";
  researchThenRetry();

  if (hasSpecificCompound) {
    const fallback = safePriorityAnswer();
    if (fallback.status === 0 && fallback.quality >= 0.85) {
      selectedEngine = "V24_SPECIFIC_ANSWER";
      answer = fallback.text;
      quality = fallback.quality;
    } else {
      answer = [
        "ALAI detectó un concepto específico que todavía no tiene una ruta segura en el grafo:",
        detected.map(e => `- ${e.name}`).join("\n"),
        "",
        "La pregunta fue enviada a investigación prioritaria para crear evidencia, conceptos y relaciones antes de responder como conocimiento fuerte.",
        "No voy a degradar la respuesta a un concepto genérico porque eso produciría una explicación incorrecta."
      ].join("\n");
      quality = 0.68;
    }
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

import Database from "better-sqlite3";

const db = new Database("data/alai.db");

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
  "que","qué","quien","quién","como","cómo","porque","por","es","son",
  "la","el","los","las","un","una","de","del","en","para","con",
  "y","o","entre","explica","explicame","relacion","relación",
  "importante","sirve","afecta","afectar","puede","existe"
]);

function keywords(text: string) {
  return norm(text)
    .split(" ")
    .filter(x => x.length > 2 && !stop.has(x));
}

const q = process.argv.slice(2).join(" ").trim();

if (!q) {
  console.error("Usage: npm run alai:v21-guard -- \"question\"");
  process.exit(1);
}

const latest:any =
  db.prepare(`
    SELECT answer
    FROM alai_v20_research_answer_closures
    ORDER BY created_at DESC
    LIMIT 1
  `).get() || {};

const answer = String(latest.answer || "");

const qWords = keywords(q);
const aWords = keywords(answer);

let overlap = 0;

for (const w of qWords) {
  if (aWords.includes(w)) overlap++;
}

const coverage =
  qWords.length === 0
    ? 0
    : overlap / qWords.length;

const passed = coverage >= 0.30;

console.log("\n=== ALAI V21 ANSWER INTEGRITY GUARD ===");
console.log({
  questionKeywords: qWords,
  overlap,
  coverage,
  passed
});

if (!passed) {
  console.log("\nINTEGRITY FAILURE");
  process.exit(1);
}

db.close();

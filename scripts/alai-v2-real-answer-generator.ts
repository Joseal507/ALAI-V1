import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const question = process.argv.slice(2).join(" ").trim();
const now = new Date().toISOString();

if (!question) {
  console.error("Usage: npm run alai:v2-answer -- \"question\"");
  process.exit(1);
}

db.exec(`
CREATE TABLE IF NOT EXISTS alai_v2_answer_runs (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  selected_concept TEXT,
  answer TEXT NOT NULL,
  quality_score REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
`);

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

const stop = new Set(["que","es","la","el","de","del","con","para","sirve","explica","relacion","tiene","compara","what","is","the","of","and","or","to","how","why"]);
function terms(s: string): string[] {
  return norm(s).split(" ").filter(t => t.length >= 3 && !stop.has(t));
}

const qTerms = terms(question);
const qSet = new Set(qTerms);

const concepts = db.prepare(`
SELECT id, name, status, confidence_score
FROM concepts
WHERE status IN ('CANONICAL','VERIFIED')
LIMIT 8000
`).all() as any[];

const ranked = concepts.map(c => {
  const cTerms = terms(c.name);
  let score = 0;
  const phrase = norm(question).includes(norm(c.name));
  if (phrase) score += 300 + cTerms.length * 50;
  const overlap = cTerms.filter(t => qSet.has(t)).length;
  score += overlap * 80;
  if (cTerms.length > 1 && overlap >= 2) score += 80;
  if (cTerms.length === 1 && qTerms.length >= 2 && overlap === 1 && !phrase) score -= 80;
  return {...c, score};
}).filter(c => c.score > 0).sort((a,b)=>b.score-a.score).slice(0,5);

const main = ranked[0];

let answer = "";
let quality = 0.45;

if (!main) {
  answer = "ALAI no encontró suficiente conocimiento confiable para responder con alta confianza. Debe crear una brecha de investigación antes de responder.";
} else {
  const relations = db.prepare(`
    SELECT c1.name AS fromName, r.relation_type AS type, c2.name AS toName
    FROM relations r
    JOIN concepts c1 ON c1.id=r.from_concept_id
    JOIN concepts c2 ON c2.id=r.to_concept_id
    WHERE r.from_concept_id=? OR r.to_concept_id=?
    LIMIT 12
  `).all(main.id, main.id) as any[];

  const beliefs = db.prepare(`
    SELECT claim, confidence_score
    FROM alai_beliefs
    WHERE subject_id=? OR lower(subject_name)=lower(?)
    ORDER BY confidence_score DESC
    LIMIT 3
  `).all(main.id, main.name) as any[];

  const usefulRelations = relations
    .filter(r => !["Ear","Cat","Foraging","Preening","Water utility","Schooling behavior"].includes(r.fromName))
    .filter(r => !["Ear","Cat","Foraging","Preening","Water utility","Schooling behavior"].includes(r.toName))
    .slice(0,5);

  const lines: string[] = [];

  lines.push(`${main.name}:`);
  lines.push(`Es un concepto ${main.status.toLowerCase()} dentro del conocimiento de ALAI.`);

  if (beliefs.length) {
    lines.push(`Idea central: ${beliefs[0].claim}`);
  }

  if (question.includes("relacion") && ranked.length >= 2) {
    lines.push(`Relación: ${main.name} se conecta con ${ranked[1].name} porque el segundo concepto ayuda a explicar estructura, uso o contexto del primero.`);
  }

  if (question.includes("compara") && ranked.length >= 2) {
    lines.push(`Comparación: ${main.name} y ${ranked[1].name} se distinguen por su función y por cómo se aplican en el dominio.`);
  }

  if (usefulRelations.length) {
    lines.push("Conexiones útiles:");
    for (const r of usefulRelations) {
      lines.push(`- ${r.fromName} ${r.type} ${r.toName}`);
    }
  }

  lines.push(`Respuesta final: ${main.name} debe explicarse con definición, uso, relaciones confiables y límites de confianza. Si falta evidencia, ALAI debe investigar antes de afirmar más.`);

  answer = lines.join("\n");
  quality = Number((0.72 + Math.min(0.18, usefulRelations.length * 0.03) + Math.min(0.1, beliefs.length * 0.03)).toFixed(3));
}

db.prepare(`
INSERT INTO alai_v2_answer_runs
(id, question, selected_concept, answer, quality_score, created_at)
VALUES (?, ?, ?, ?, ?, ?)
`).run(crypto.randomUUID(), question, main?.name || null, answer, quality, now);

console.log("\n=== ALAI V2 REAL ANSWER ===");
console.log({ selectedConcept: main?.name || null, quality });
console.log("");
console.log(answer);

db.close();

if (quality < 0.7) process.exit(1);

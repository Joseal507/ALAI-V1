import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();
const question = process.argv.slice(2).join(" ").trim();

if (!question) {
  console.error("Usage: npm run alai:v3-answer -- \"question\"");
  process.exit(1);
}

db.exec(`
CREATE TABLE IF NOT EXISTS alai_v3_answer_runs (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  intent TEXT NOT NULL,
  selected_concept TEXT,
  answer TEXT NOT NULL,
  quality_score REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alai_conversational_learning_feedback (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  score REAL NOT NULL,
  gap_detected TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
`);

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

const stop = new Set(["que","es","la","el","de","del","con","para","sirve","explica","relacion","tiene","compara","what","is","the","of","and","or","to","how","why","a","an"]);
function terms(s: string): string[] {
  return norm(s).split(" ").filter(t => t.length >= 3 && !stop.has(t));
}

function intent(q: string): string {
  const n = norm(q);
  if (n.includes("compara")) return "COMPARE";
  if (n.includes("relacion")) return "RELATE";
  if (n.includes("sirve") || n.includes("para que")) return "USE";
  if (n.includes("que es")) return "DEFINE";
  return "EXPLAIN";
}

const qTerms = terms(question);
const qSet = new Set(qTerms);

const concepts = db.prepare(`
SELECT id, name, status, confidence_score
FROM concepts
WHERE status IN ('CANONICAL','VERIFIED')
LIMIT 9000
`).all() as any[];

const ranked = concepts.map(c => {
  const cTerms = terms(c.name);
  const phrase = norm(question).includes(norm(c.name));
  const overlap = cTerms.filter(t => qSet.has(t)).length;
  let score = 0;
  if (phrase) score += 350 + cTerms.length * 60;
  score += overlap * 90;
  if (cTerms.length > 1 && overlap >= 2) score += 100;
  if (cTerms.length === 1 && qTerms.length >= 2 && overlap === 1 && !phrase) score -= 90;
  return {...c, score};
}).filter(c => c.score > 0).sort((a,b)=>b.score-a.score).slice(0,5);

const main = ranked[0];
const mode = intent(question);

let answer = "";
let quality = 0.45;

if (!main) {
  answer = "No encontré una base confiable suficiente para responder. ALAI debe investigar este tema antes de afirmarlo.";
} else {
  const relations = db.prepare(`
    SELECT c1.name AS fromName, r.relation_type AS type, c2.name AS toName
    FROM relations r
    JOIN concepts c1 ON c1.id=r.from_concept_id
    JOIN concepts c2 ON c2.id=r.to_concept_id
    WHERE r.from_concept_id=? OR r.to_concept_id=?
    LIMIT 20
  `).all(main.id, main.id) as any[];

  const beliefs = db.prepare(`
    SELECT claim, confidence_score
    FROM alai_beliefs
    WHERE subject_id=? OR lower(subject_name)=lower(?)
    ORDER BY confidence_score DESC
    LIMIT 5
  `).all(main.id, main.name) as any[];

  const evidenceCount = Number((db.prepare(`
    SELECT COUNT(*) AS n FROM concept_evidence_links WHERE concept_id=?
  `).get(main.id) as any)?.n ?? 0);

  const banned = new Set(["Ear","Cat","Foraging","Preening","Water utility","Schooling behavior","Anthroposophy","Transitoria Cuarta"]);
  const usefulRelations = relations
    .filter(r => !banned.has(r.fromName) && !banned.has(r.toName))
    .slice(0,6);

  const lines: string[] = [];

  if (mode === "DEFINE" || mode === "EXPLAIN") {
    lines.push(`${main.name} es un concepto que ALAI reconoce como ${main.status.toLowerCase()}.`);
    lines.push(`En términos simples, debe entenderse por su definición, su función, sus relaciones y la evidencia que lo respalda.`);
  }

  if (mode === "USE") {
    lines.push(`${main.name} sirve para organizar conocimiento y conectar habilidades básicas con aplicaciones más avanzadas.`);
  }

  if (mode === "RELATE" && ranked.length >= 2) {
    lines.push(`${main.name} se relaciona con ${ranked[1].name} porque ${ranked[1].name} ayuda a explicar su estructura, uso o contexto.`);
  }

  if (mode === "COMPARE" && ranked.length >= 2) {
    lines.push(`${main.name} y ${ranked[1].name} se comparan por función, estructura y aplicación.`);
  }

  if (beliefs.length) {
    lines.push(`Idea central registrada: ${beliefs[0].claim}`);
  }

  if (usefulRelations.length) {
    lines.push(`Conexiones confiables:`);
    for (const r of usefulRelations) {
      lines.push(`- ${r.fromName} ${r.type} ${r.toName}`);
    }
  }

  lines.push(`Nivel de evidencia interna: ${evidenceCount} vínculos de evidencia.`);
  lines.push(`Conclusión: ${main.name} debe explicarse de forma útil, con ejemplos, conexiones confiables y límites claros cuando falte evidencia.`);

  answer = lines.join("\n");
  quality = Number((0.72 + Math.min(0.1, beliefs.length * 0.025) + Math.min(0.12, usefulRelations.length * 0.02) + Math.min(0.06, evidenceCount * 0.01)).toFixed(3));
}

db.prepare(`
INSERT INTO alai_v3_answer_runs
(id, question, intent, selected_concept, answer, quality_score, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?)
`).run(crypto.randomUUID(), question, mode, main?.name || null, answer, quality, now);

let gap = "";
if (quality < 0.78) gap = "Answer needs stronger evidence, relations, or explanatory synthesis.";

db.prepare(`
INSERT INTO alai_conversational_learning_feedback
(id, question, answer, score, gap_detected, created_at)
VALUES (?, ?, ?, ?, ?, ?)
`).run(crypto.randomUUID(), question, answer, quality, gap, now);

if (gap) {
  db.prepare(`
    INSERT INTO alai_research_questions
    (id, concept_id, topic_id, question, question_type, priority_score, status, created_at, updated_at)
    VALUES (?, ?, NULL, ?, 'CONVERSATION_LEARNING_GAP', 0.9, 'OPEN', ?, ?)
  `).run(crypto.randomUUID(), main?.id || null, `Improve answer quality for: ${question}`, now, now);
}

console.log("\n=== ALAI V3 NEURAL ANSWER LAYER ===");
console.log({ selectedConcept: main?.name || null, intent: mode, quality });
console.log("");
console.log(answer);

db.close();

if (quality < 0.7) process.exit(1);

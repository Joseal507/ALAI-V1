import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();
const question = process.argv.slice(2).join(" ").trim();

if (!question) {
  console.error("Usage: npm run alai:v7-answer -- \"question\"");
  process.exit(1);
}

db.exec(`
CREATE TABLE IF NOT EXISTS alai_v7_answer_runs (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  intent TEXT NOT NULL,
  selected_concepts TEXT NOT NULL,
  answer TEXT NOT NULL,
  quality_score REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alai_v7_answer_gaps (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  missing_target TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const stop = new Set([
  "que","qué","es","una","uno","un","la","el","los","las","de","del","con","para",
  "sirve","explica","explicar","relacion","relación","tiene","compara","porque",
  "como","cómo","pana","bro","dime","dame","pasaria","pasaría","desapareciera",
  "entre","estan","están","si","en","y","o","a","por","se","al","lo",
  "what","is","the","of","and","or","to","how","why","an"
]);

function terms(s: string): string[] {
  return norm(s).split(" ").filter(t => t.length >= 3 && !stop.has(t));
}

function intent(q: string): string {
  const n = norm(q);
  if (n.includes("compara")) return "COMPARE";
  if (n.includes("relacion") || n.includes("conect")) return "RELATE";
  if (n.includes("sirve") || n.includes("para que")) return "USE";
  if (n.includes("porque") || n.includes("por que") || n.includes("si ")) return "CAUSE";
  if (n.includes("paso a paso") || n.includes("como ")) return "MULTISTEP";
  if (n.includes("que es")) return "DEFINE";
  return "EXPLAIN";
}

function rows<T=any>(sql: string, params: any[] = []): T[] {
  try { return db.prepare(sql).all(...params) as T[]; } catch { return []; }
}

function get<T=any>(sql: string, params: any[] = []): T | null {
  try { return db.prepare(sql).get(...params) as T; } catch { return null; }
}

const qNorm = norm(question);
const qTerms = terms(question);
const qSet = new Set(qTerms);
const mode = intent(question);

const allConcepts = rows(`
SELECT id, name, description, status, confidence_score
FROM concepts
WHERE status IN ('CANONICAL','VERIFIED','PENDING')
LIMIT 12000
`);

const bannedGeneral = new Set([
  "one","two","three","animal","animals","science","mode","stem","learning",
  "education","family","body parts","ancient greek education","situated learning",
  "learning styles","pattern recognition"
]);

function scoreConcept(c: any): number {
  const name = String(c.name || "");
  const cNorm = norm(name);
  const cTerms = terms(name);
  if (!cNorm || bannedGeneral.has(cNorm)) return -999;

  let score = 0;

  if (qNorm.includes(cNorm)) score += 500 + cTerms.length * 80;

  let overlap = 0;
  for (const t of cTerms) {
    if (qSet.has(t)) overlap++;
  }

  score += overlap * 110;

  if (cTerms.length > 1 && overlap >= Math.min(2, cTerms.length)) score += 160;
  if (cTerms.length === 1 && qTerms.length >= 3 && overlap === 1 && !qNorm.includes(cNorm)) score -= 160;

  if (String(c.status) === "CANONICAL") score += 40;
  if (String(c.status) === "VERIFIED") score += 30;
  if (String(c.status) === "PENDING") score -= 40;

  return score;
}

let selected = allConcepts
  .map(c => ({...c, score: scoreConcept(c)}))
  .filter(c => c.score > 0)
  .sort((a,b)=>b.score-a.score)
  .slice(0,6);

const strongSelected = selected.filter(c => c.score >= 140);
selected = strongSelected.length ? strongSelected : selected.slice(0,2);

const selectedIds = selected.map(c => c.id);

const relationRows = selectedIds.length
  ? rows(`
      SELECT
        c1.name AS fromName,
        c1.id AS fromId,
        r.relation_type AS type,
        c2.name AS toName,
        c2.id AS toId
      FROM relations r
      JOIN concepts c1 ON c1.id=r.from_concept_id
      JOIN concepts c2 ON c2.id=r.to_concept_id
      WHERE r.from_concept_id IN (${selectedIds.map(()=>"?").join(",")})
         OR r.to_concept_id IN (${selectedIds.map(()=>"?").join(",")})
      LIMIT 120
    `, [...selectedIds, ...selectedIds])
  : [];

function relationScore(r: any): number {
  const a = norm(r.fromName);
  const b = norm(r.toName);
  if (bannedGeneral.has(a) || bannedGeneral.has(b)) return -999;

  const text = `${a} ${b}`;
  let s = 0;

  for (const t of qTerms) {
    if (text.includes(t)) s += 35;
  }

  if (["PART_OF","DEPENDS_ON","PREREQUISITE_FOR","FOUNDATION_FOR","CAUSES","SUPPORTS","APPLICATION_OF","CONTRASTS_WITH","ALIAS_OF"].includes(r.type)) {
    s += 25;
  }

  for (const c of selected) {
    if (a === norm(c.name) || b === norm(c.name)) s += 40;
  }

  return s;
}

const usefulRelations = relationRows
  .map(r => ({...r, score: relationScore(r)}))
  .filter(r => r.score > 20)
  .sort((a,b)=>b.score-a.score)
  .slice(0,8);

const beliefs = selectedIds.length
  ? rows(`
      SELECT subject_name, claim, confidence_score
      FROM alai_beliefs
      WHERE subject_id IN (${selectedIds.map(()=>"?").join(",")})
         OR lower(subject_name) IN (${selected.map(()=> "lower(?)").join(",")})
      ORDER BY confidence_score DESC
      LIMIT 5
    `, [...selectedIds, ...selected.map(c => c.name)])
  : [];

const evidenceCounts = new Map<string, number>();
for (const c of selected) {
  const e = get(`SELECT COUNT(*) AS n FROM concept_evidence_links WHERE concept_id=?`, [c.id]) as any;
  evidenceCounts.set(c.id, Number(e?.n || 0));
}

function readableName(name: string): string {
  return String(name || "").replace(/\b\w/g, m => m.toUpperCase());
}

function describeConcept(c: any): string {
  const desc = String(c.description || "").trim();
  if (desc && desc.length > 15 && !desc.toLowerCase().includes("autonomous curriculum concept")) {
    return desc.replace(/\s+/g, " ").slice(0, 260);
  }

  const belief = beliefs.find((b:any) => norm(b.subject_name || "") === norm(c.name || ""));
  if (belief?.claim) return String(belief.claim).replace(/\s+/g, " ").slice(0, 260);

  return `${readableName(c.name)} es un concepto que ALAI tiene registrado como ${String(c.status).toLowerCase()}, pero todavía necesita mejor definición interna y más evidencia para explicarlo con profundidad.`;
}

function createGap(target: string, reason: string) {
  db.prepare(`
    INSERT INTO alai_v7_answer_gaps
    (id, question, missing_target, reason, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'OPEN', ?, ?)
  `).run(crypto.randomUUID(), question, target, reason, now, now);

  try {
    db.prepare(`
      INSERT INTO alai_research_questions
      (id, concept_id, topic_id, question, question_type, priority_score, status, created_at, updated_at)
      VALUES (?, NULL, NULL, ?, 'V7_ANSWER_GAP', 0.92, 'OPEN', ?, ?)
    `).run(crypto.randomUUID(), `ALAI needs grounded knowledge to answer: ${question}`, now, now);
  } catch {}
}

function buildAnswer(): { answer: string; quality: number } {
  if (selected.length === 0) {
    createGap(question, "No relevant concepts selected from internal knowledge.");
    return {
      quality: 0.42,
      answer: [
        "No tengo suficiente conocimiento interno confiable para responder bien esta pregunta todavía.",
        "Ya marqué esto como una brecha de aprendizaje para que ALAI lo investigue, agregue evidencia, cree relaciones correctas y luego pueda responder sin inventar."
      ].join("\n")
    };
  }

  const lines: string[] = [];
  const names = selected.map(c => readableName(c.name));

  if (mode === "DEFINE") {
    const c = selected[0];
    lines.push(`${readableName(c.name)}:`);
    lines.push(describeConcept(c));
  } else if (mode === "COMPARE" && selected.length >= 2) {
    lines.push(`Comparación entre ${names[0]} y ${names[1]}:`);
    lines.push(`- ${names[0]}: ${describeConcept(selected[0])}`);
    lines.push(`- ${names[1]}: ${describeConcept(selected[1])}`);
    lines.push("La comparación correcta debe mirar función, estructura, uso y contexto.");
  } else if ((mode === "RELATE" || mode === "MULTISTEP" || mode === "CAUSE") && selected.length >= 2) {
    lines.push(`Relación entre ${names.slice(0,3).join(", ")}:`);
    for (const c of selected.slice(0,3)) {
      lines.push(`- ${readableName(c.name)}: ${describeConcept(c)}`);
    }
  } else {
    const c = selected[0];
    lines.push(`${readableName(c.name)}:`);
    lines.push(describeConcept(c));
  }

  if (usefulRelations.length > 0) {
    lines.push("");
    lines.push("Conexiones internas relevantes:");
    for (const r of usefulRelations.slice(0,5)) {
      lines.push(`- ${readableName(r.fromName)} ${r.type} ${readableName(r.toName)}`);
    }
  }

  const totalEvidence = selected.reduce((sum, c) => sum + (evidenceCounts.get(c.id) || 0), 0);

  if (mode === "MULTISTEP" || mode === "CAUSE") {
    lines.push("");
    lines.push("Razonamiento:");
    if (usefulRelations.length >= 2) {
      usefulRelations.slice(0,4).forEach((r, i) => {
        lines.push(`${i + 1}. ${readableName(r.fromName)} se conecta con ${readableName(r.toName)} mediante ${r.type}.`);
      });
      lines.push("Conclusión: la respuesta debe seguir la cadena de relaciones anteriores y no saltar a conceptos fuera del tema.");
    } else {
      lines.push("ALAI detectó los conceptos principales, pero todavía no tiene suficientes relaciones causales confiables para explicar toda la cadena con profundidad.");
      createGap(question, "Missing causal or multi-hop relations.");
    }
  }

  lines.push("");
  lines.push(`Confianza interna: ${totalEvidence >= 6 ? "alta" : totalEvidence >= 3 ? "media" : "baja"} (${totalEvidence} vínculos de evidencia).`);

  let quality = 0.62;
  quality += Math.min(0.16, selected.length * 0.035);
  quality += Math.min(0.14, usefulRelations.length * 0.02);
  quality += Math.min(0.08, totalEvidence * 0.01);
  if (mode === "MULTISTEP" || mode === "CAUSE") quality -= usefulRelations.length >= 2 ? 0 : 0.12;

  quality = Number(Math.max(0.35, Math.min(0.96, quality)).toFixed(3));

  return { answer: lines.join("\n"), quality };
}

const result = buildAnswer();

db.prepare(`
INSERT INTO alai_v7_answer_runs
(id, question, intent, selected_concepts, answer, quality_score, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?)
`).run(
  crypto.randomUUID(),
  question,
  mode,
  JSON.stringify(selected.map(c => ({id:c.id, name:c.name, status:c.status, score:c.score}))),
  result.answer,
  result.quality,
  now
);

console.log("\n=== ALAI V7 SEMANTIC SUBGRAPH ANSWER ===");
console.log({
  intent: mode,
  selectedConcepts: selected.map(c => c.name),
  relationsUsed: usefulRelations.length,
  quality: result.quality
});
console.log("");
console.log(result.answer);

db.close();

if (result.quality < 0.5) process.exit(1);

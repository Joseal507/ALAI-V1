import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();
const question = process.argv.slice(2).join(" ").trim();

if (!question) {
  console.error("Usage: npm run alai:v9-answer -- \"question\"");
  process.exit(1);
}

db.exec(`
CREATE TABLE IF NOT EXISTS alai_v9_answer_runs (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  intent TEXT NOT NULL,
  retrieval_json TEXT NOT NULL,
  reasoning_json TEXT NOT NULL,
  answer TEXT NOT NULL,
  quality_score REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alai_v9_retrieval_traces (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  stage TEXT NOT NULL,
  data TEXT NOT NULL,
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
  "que","qué","es","una","uno","un","la","el","los","las","de","del","con","para",
  "sirve","explica","explicame","explicar","relacion","relación","tiene","compara",
  "porque","por","como","cómo","pana","bro","dime","dame","pasaria","pasaría",
  "desapareciera","entre","estan","están","si","en","y","o","a","se","al","lo",
  "termina","llegando","produce","estan","conectados","conectadas","what","is",
  "the","of","and","or","to","how","why","an"
]);

function terms(s: string): string[] {
  return norm(s).split(" ").filter(t => t.length >= 2 && !stop.has(t));
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

function trace(stage: string, data: unknown) {
  db.prepare(`
    INSERT INTO alai_v9_retrieval_traces
    (id, question, stage, data, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(crypto.randomUUID(), question, stage, JSON.stringify(data), now);
}

const qNorm = norm(question);
const qTerms = terms(question);
const qSet = new Set(qTerms);
const mode = intent(question);

const domainLexicons: Record<string, string[]> = {
  biology: [
    "fotosintesis","photosynthesis","oxigeno","oxygen","respiracion","cellular","cadena","alimenticia","food","chain",
    "energia","solar","sol","animales","animal","adn","dna","arn","rna","proteina","protein","genetica","genetics",
    "neurona","neuron","nervioso","nervous","mitosis","meiosis","ecosistema","ecosystem"
  ],
  math: [
    "vector","scalar","escalar","matriz","matrix","algebra","linear","lineal","ecuacion","equation","slope","pendiente",
    "variable","function","funcion","geometry","geometria"
  ],
  ai: [
    "machine","learning","deep","neural","network","red","neuronal","modelo","model","datos","data","entrenamiento",
    "training","inteligencia","artificial"
  ],
  education: [
    "primary","education","educacion","school","escuela","curriculum","aprendizaje","estudiante"
  ]
};

function detectDomains(): string[] {
  const found: string[] = [];
  for (const [domain, words] of Object.entries(domainLexicons)) {
    if (words.some(w => qNorm.includes(norm(w)))) found.push(domain);
  }
  return found.length ? found : ["general"];
}

const domains = detectDomains();

const domainAllowed: Record<string, string[]> = {
  biology: ["biology","genetics","natural sciences","medicine","life"],
  math: ["math","mathematics","algebra","linear algebra","statistics","probability"],
  ai: ["ai","technology","computer","machine learning","artificial intelligence"],
  education: ["education","primary","curriculum","learning"]
};

const hardBannedByDomain: Record<string, string[]> = {
  biology: [
    "infant development","observational learning","ancient greek education","situated learning","learning styles",
    "shape","red","blue","green","mathematics","algebra","vector","scalar","one","two","three","ox"
  ],
  math: [
    "infant development","observational learning","animal","animals","ancient greek education","red","green","blue",
    "neuron","ecosystem","food chain"
  ],
  ai: [
    "red","green","blue","red blue red blue","green red component a","animal","infant development","observational learning",
    "ancient greek education"
  ],
  education: [
    "ox","red blue red blue","green red component a"
  ],
  general: [
    "ox","red blue red blue","green red component a","ancient greek education"
  ]
};

function isHardBanned(name: string): boolean {
  const n = norm(name);
  for (const d of domains) {
    for (const b of hardBannedByDomain[d] || []) {
      if (n === norm(b) || n.includes(norm(b))) return true;
    }
  }
  return false;
}

const aliasRows = rows(`
SELECT phrase, canonical_name, domain_hint, priority_score
FROM alai_v7_entity_aliases
WHERE status='ACTIVE'
ORDER BY priority_score DESC
`);

const bridgeRows = rows(`
SELECT trigger_phrase, target_concept, reason, priority_score
FROM alai_v8_chat_bridge_rules
WHERE status='ACTIVE'
ORDER BY priority_score DESC
`);

const aliasTargets = aliasRows
  .filter((a:any) => qNorm.includes(norm(a.phrase)))
  .map((a:any) => String(a.canonical_name));

const bridgeTargets = bridgeRows
  .filter((b:any) => {
    const tt = terms(String(b.trigger_phrase || ""));
    return tt.length > 0 && tt.every(t => qNorm.includes(t));
  })
  .map((b:any) => String(b.target_concept));

const forcedTargets = [...new Set([...aliasTargets, ...bridgeTargets])];

trace("question_analysis", { mode, qTerms, domains, forcedTargets });

const allConcepts = rows(`
SELECT id, name, description, status, confidence_score
FROM concepts
WHERE status IN ('CANONICAL','VERIFIED','PENDING')
LIMIT 15000
`);

function conceptDomainBoost(c: any): number {
  const text = norm(`${c.name} ${c.description || ""}`);
  let boost = 0;

  for (const d of domains) {
    for (const word of domainLexicons[d] || []) {
      if (text.includes(norm(word))) boost += 8;
    }

    for (const allow of domainAllowed[d] || []) {
      if (text.includes(norm(allow))) boost += 15;
    }
  }

  return boost;
}

function conceptScore(c: any): number {
  const name = String(c.name || "");
  const cNorm = norm(name);
  const cTerms = terms(name);
  const desc = norm(String(c.description || ""));

  if (!cNorm) return -9999;
  if (isHardBanned(cNorm)) return -9999;

  let score = 0;

  for (const target of forcedTargets) {
    if (cNorm === norm(target)) score += 2000;
    else if (cNorm.includes(norm(target)) || norm(target).includes(cNorm)) score += 600;
  }

  if (qNorm.includes(cNorm)) score += 900 + cTerms.length * 120;

  let overlap = 0;
  for (const t of cTerms) {
    if (qSet.has(t)) overlap++;
  }

  score += overlap * 130;

  for (const t of qTerms) {
    if (desc.includes(t)) score += 8;
  }

  if (cTerms.length > 1 && overlap >= Math.min(2, cTerms.length)) score += 220;

  const forced = forcedTargets.some(t => cNorm === norm(t));
  if (cTerms.length === 1 && qTerms.length >= 3 && overlap === 1 && !qNorm.includes(cNorm) && !forced) {
    score -= 420;
  }

  if (String(c.status) === "CANONICAL") score += 60;
  if (String(c.status) === "VERIFIED") score += 45;
  if (String(c.status) === "PENDING") score -= 60;

  score += conceptDomainBoost(c);

  return score;
}

let candidates = allConcepts
  .map(c => ({...c, score: conceptScore(c)}))
  .filter(c => c.score > 0)
  .sort((a,b)=>b.score-a.score);

const forcedConcepts = candidates.filter(c =>
  forcedTargets.some(t => norm(c.name) === norm(t))
);

const nonForced = candidates.filter(c =>
  !forcedTargets.some(t => norm(c.name) === norm(t))
);

let selected = [...forcedConcepts, ...nonForced]
  .filter((c, i, arr) => arr.findIndex(x => x.id === c.id) === i)
  .slice(0, 6);

selected = selected.filter(c => c.score >= 120 || forcedTargets.some(t => norm(c.name) === norm(t)));

trace("candidate_ranking", {
  topCandidates: candidates.slice(0, 12).map(c => ({name:c.name, status:c.status, score:c.score})),
  selected: selected.map(c => ({name:c.name, status:c.status, score:c.score}))
});

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
      LIMIT 250
    `, [...selectedIds, ...selectedIds])
  : [];

function relationScore(r: any): number {
  const a = norm(r.fromName);
  const b = norm(r.toName);
  const text = `${a} ${b} ${norm(r.type)}`;

  if (isHardBanned(a) || isHardBanned(b)) return -9999;

  let s = 0;

  for (const target of forcedTargets) {
    const tn = norm(target);
    if (a === tn || b === tn) s += 110;
  }

  for (const c of selected) {
    const cn = norm(c.name);
    if (a === cn || b === cn) s += 80;
  }

  for (const t of qTerms) {
    if (text.includes(t)) s += 25;
  }

  if (["CAUSES","PRODUCES","USES","SUPPORTS","PART_OF","DEPENDS_ON","PREREQUISITE_FOR","FOUNDATION_FOR","APPLICATION_OF","CONTRASTS_WITH","ALIAS_OF"].includes(String(r.type))) {
    s += 40;
  }

  if (String(r.type).includes("REQUIRES") && (a.includes("understanding model") || b.includes("understanding model") || a.includes("evidence requirements") || b.includes("evidence requirements") || a.includes("reasoning tests") || b.includes("reasoning tests"))) {
    s -= 180;
  }

  return s;
}

const usefulRelations = relationRows
  .map(r => ({...r, score: relationScore(r)}))
  .filter(r => r.score > 40)
  .sort((a,b)=>b.score-a.score)
  .slice(0, 10);

trace("relation_ranking", {
  usefulRelations: usefulRelations.map(r => ({from:r.fromName, type:r.type, to:r.toName, score:r.score}))
});

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

function readable(name: string): string {
  return String(name || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, m => m.toUpperCase());
}

function describeConcept(c: any): string {
  const desc = String(c.description || "").trim();

  if (
    desc &&
    desc.length > 15 &&
    !desc.toLowerCase().includes("concept discovered during") &&
    !desc.toLowerCase().includes("autonomous curriculum concept")
  ) {
    return desc.replace(/\s+/g, " ").slice(0, 300);
  }

  const belief = beliefs.find((b:any) => norm(b.subject_name || "") === norm(c.name || ""));
  if (belief?.claim && !String(belief.claim).includes("knowledge concept ALAI currently represents")) {
    return String(belief.claim).replace(/\s+/g, " ").slice(0, 300);
  }

  return `${readable(c.name)} está en el conocimiento interno de ALAI, pero necesita una definición más rica y evidencia más específica para explicarse con profundidad.`;
}

function createGap(reason: string) {
  try {
    db.prepare(`
      INSERT INTO alai_research_questions
      (id, concept_id, topic_id, question, question_type, priority_score, status, created_at, updated_at)
      VALUES (?, NULL, NULL, ?, 'V9_RETRIEVAL_OR_SYNTHESIS_GAP', 0.94, 'OPEN', ?, ?)
    `).run(crypto.randomUUID(), `Improve retrieval/synthesis for: ${question}. Reason: ${reason}`, now, now);
  } catch {}
}

function buildAnswer(): { answer: string; quality: number; reasoning: any } {
  if (selected.length === 0) {
    createGap("No selected concepts.");
    return {
      quality: 0.35,
      reasoning: { failure: "NO_CONCEPTS" },
      answer: "ALAI no encontró conceptos internos suficientemente relevantes para responder bien. Se creó una brecha de aprendizaje para reparar recuperación y síntesis."
    };
  }

  const totalEvidence = selected.reduce((sum, c) => sum + (evidenceCounts.get(c.id) || 0), 0);
  const lines: string[] = [];
  const names = selected.map(c => readable(c.name));
  const reasoning: any = {
    intent: mode,
    concepts: names,
    relationCount: usefulRelations.length,
    evidence: totalEvidence
  };

  if (mode === "DEFINE") {
    const c = selected[0];
    lines.push(`${readable(c.name)}:`);
    lines.push(describeConcept(c));
  } else if (mode === "COMPARE" && selected.length >= 2) {
    lines.push(`Comparación entre ${names[0]} y ${names[1]}:`);
    lines.push(`- ${names[0]}: ${describeConcept(selected[0])}`);
    lines.push(`- ${names[1]}: ${describeConcept(selected[1])}`);
    lines.push("Diferencia principal: se distinguen por su función, estructura, uso y contexto.");
  } else if ((mode === "RELATE" || mode === "MULTISTEP" || mode === "CAUSE") && selected.length >= 2) {
    lines.push(`Relación entre ${names.slice(0,4).join(", ")}:`);
    for (const c of selected.slice(0,4)) {
      lines.push(`- ${readable(c.name)}: ${describeConcept(c)}`);
    }
  } else {
    const c = selected[0];
    lines.push(`${readable(c.name)}:`);
    lines.push(describeConcept(c));
  }

  if (usefulRelations.length > 0) {
    lines.push("");
    lines.push("Relaciones internas útiles:");
    for (const r of usefulRelations.slice(0,6)) {
      lines.push(`- ${readable(r.fromName)} ${r.type} ${readable(r.toName)}`);
    }
  }

  if (mode === "MULTISTEP" || mode === "CAUSE" || mode === "RELATE") {
    lines.push("");
    lines.push("Síntesis razonada:");
    if (selected.length >= 2) {
      lines.push(`1. La pregunta apunta a ${names.slice(0,3).join(", ")}.`);
      if (usefulRelations.length > 0) {
        lines.push(`2. ALAI encontró relaciones internas entre esos conceptos o conceptos cercanos.`);
      } else {
        lines.push(`2. ALAI no encontró suficientes relaciones internas directas, así que debe fortalecer ese subgrafo.`);
      }
      lines.push(`3. La respuesta debe usar solo conceptos relevantes al dominio ${domains.join(", ")} y evitar saltos fuera del tema.`);
    }
  }

  if (totalEvidence < 3 || (mode !== "DEFINE" && usefulRelations.length < 2)) {
    createGap("Weak evidence or weak relation path.");
  }

  lines.push("");
  lines.push(`Confianza interna: ${totalEvidence >= 8 ? "alta" : totalEvidence >= 3 ? "media" : "baja"} (${totalEvidence} vínculos de evidencia).`);

  let quality = 0.55;
  quality += Math.min(0.18, selected.length * 0.035);
  quality += Math.min(0.18, usefulRelations.length * 0.022);
  quality += Math.min(0.1, totalEvidence * 0.01);
  if (forcedTargets.length > 0) quality += 0.08;
  if (mode !== "DEFINE" && selected.length < 2) quality -= 0.14;
  if ((mode === "MULTISTEP" || mode === "CAUSE") && usefulRelations.length < 2) quality -= 0.08;

  quality = Number(Math.max(0.3, Math.min(0.97, quality)).toFixed(3));

  return { answer: lines.join("\n"), quality, reasoning };
}

const result = buildAnswer();

db.prepare(`
INSERT INTO alai_v9_answer_runs
(id, question, intent, retrieval_json, reasoning_json, answer, quality_score, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  crypto.randomUUID(),
  question,
  mode,
  JSON.stringify({
    domains,
    qTerms,
    forcedTargets,
    selected: selected.map(c => ({id:c.id, name:c.name, status:c.status, score:c.score})),
    relations: usefulRelations.map(r => ({from:r.fromName, type:r.type, to:r.toName, score:r.score}))
  }),
  JSON.stringify(result.reasoning),
  result.answer,
  result.quality,
  now
);

console.log("\n=== ALAI V9 PIPELINE ANSWER ===");
console.log({
  intent: mode,
  domains,
  forcedTargets,
  selectedConcepts: selected.map(c => c.name),
  relationsUsed: usefulRelations.length,
  quality: result.quality
});
console.log("");
console.log(result.answer);

db.close();

if (result.quality < 0.45) process.exit(1);

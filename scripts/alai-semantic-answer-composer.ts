import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

const question = process.argv.slice(2).join(" ").trim();

if (!question) {
  console.error("Usage: npm run alai:semantic-answer -- \"question\"");
  process.exit(1);
}

db.exec(`
CREATE TABLE IF NOT EXISTS alai_semantic_answer_runs (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  selected_concepts TEXT NOT NULL,
  beliefs_used INTEGER NOT NULL DEFAULT 0,
  relations_used INTEGER NOT NULL DEFAULT 0,
  traces_used INTEGER NOT NULL DEFAULT 0,
  memories_used INTEGER NOT NULL DEFAULT 0,
  answer TEXT NOT NULL,
  quality_score REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'COMPLETED',
  created_at TEXT NOT NULL
);
`);

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const stop = new Set([
  "que","es","la","el","los","las","un","una","de","del","con","por","para","como",
  "sirve","explica","relacion","tiene","compara","y","o","en","a",
  "what","is","the","of","to","and","or","how","why","compare","explain"
]);

function terms(text: string): string[] {
  return normalize(text).split(" ").filter(t => t.length >= 3 && !stop.has(t));
}

function wholePhrase(haystack: string, phraseTerms: string[]): boolean {
  const words = haystack.split(" ");
  for (let i = 0; i <= words.length - phraseTerms.length; i++) {
    let ok = true;
    for (let j = 0; j < phraseTerms.length; j++) {
      if (words[i + j] !== phraseTerms[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

function rankedConcepts(q: string) {
  const qNorm = normalize(q);
  const qTerms = terms(q);
  const qSet = new Set(qTerms);

  const concepts = db.prepare(`
    SELECT id,name,status,confidence_score
    FROM concepts
    WHERE status IN ('CANONICAL','VERIFIED')
    LIMIT 6000
  `).all() as any[];

  const ranked:any[] = [];

  for (const c of concepts) {
    const cTerms = terms(c.name);
    if (!cTerms.length) continue;

    let score = 0;
    const phrase = wholePhrase(qNorm, cTerms);
    const covered = cTerms.filter(t => qSet.has(t)).length;

    if (phrase) score += 250 + cTerms.length * 35;
    if (covered > 0) {
      score += covered * 60;
      score += (covered / Math.max(1, cTerms.length)) * 60;
      score += (covered / Math.max(1, qTerms.length)) * 40;
    }
    if (cTerms.length > 1 && covered >= Math.min(2, cTerms.length)) {
      score += cTerms.length * 40;
    }
    if (cTerms.length === 1 && qTerms.length >= 2 && covered === 1 && !phrase) {
      score -= 80;
    }
    if (cTerms.length === 1 && cTerms[0].length <= 3 && !qSet.has(cTerms[0])) {
      score = 0;
    }

    if (score > 0) ranked.push({...c, score});
  }

  ranked.sort((a,b)=>b.score-a.score);
  return ranked.slice(0,5);
}

function getBeliefs(conceptIds: string[]) {
  if (!conceptIds.length) return [];
  const ph = conceptIds.map(()=>"?").join(",");
  return db.prepare(`
    SELECT subject_name, claim, confidence_score, status
    FROM alai_beliefs
    WHERE subject_id IN (${ph})
    ORDER BY confidence_score DESC
    LIMIT 10
  `).all(...conceptIds) as any[];
}

function getRelations(conceptIds: string[]) {
  if (!conceptIds.length) return [];
  const ph = conceptIds.map(()=>"?").join(",");
  return db.prepare(`
    SELECT
      c1.name AS fromName,
      r.relation_type AS type,
      c2.name AS toName,
      c2.status AS toStatus
    FROM relations r
    JOIN concepts c1 ON c1.id=r.from_concept_id
    JOIN concepts c2 ON c2.id=r.to_concept_id
    WHERE r.from_concept_id IN (${ph})
       OR r.to_concept_id IN (${ph})
    GROUP BY c1.name,r.relation_type,c2.name
    ORDER BY
      CASE c2.status WHEN 'CANONICAL' THEN 0 WHEN 'VERIFIED' THEN 1 ELSE 2 END
    LIMIT 18
  `).all(...conceptIds, ...conceptIds) as any[];
}

function getTraces(question: string, concepts: any[]) {
  const conceptTerms = concepts.flatMap(c => terms(c.name));
  const questionTerms = terms(question);
  const allowed = new Set([...conceptTerms, ...questionTerms]);

  const toxic = [
    "water utility",
    "preening",
    "schooling behavior",
    "solitary hunter",
    "aquatic locomotion",
    "adaptive radiation",
    "cat"
  ];

  const filtered = db.prepare(`
    SELECT public_reasoning, conclusion, confidence_score
    FROM alai_reasoning_traces
    WHERE COALESCE(status,'READY')!='WEAK'
    ORDER BY confidence_score DESC
    LIMIT 1000
  `).all() as any[];

  const mainConceptTerms = concepts.length ? terms(concepts[0].name) : [];

  const scored = filtered.map(t => {
    const text = normalize(`${t.public_reasoning} ${t.conclusion}`);
    const words = text.split(" ");

    if (toxic.some(x => text.includes(normalize(x)))) {
      return {...t, score: -999};
    }

    const mainOverlap = mainConceptTerms.filter(term => words.includes(term)).length;

    // Hard gate: do not use a trace unless it directly mentions the main concept terms.
    if (mainConceptTerms.length > 0 && mainOverlap === 0) {
      return {...t, score: -999};
    }

    let overlap = 0;
    for (const term of allowed) {
      if (words.includes(term)) overlap++;
    }

    const traceTerms = terms(text);
    const irrelevantTerms = traceTerms.filter(t => !allowed.has(t)).length;
    const relevance = overlap / Math.max(1, allowed.size);
    const mainBoost = mainOverlap / Math.max(1, mainConceptTerms.length);
    const penalty = Math.min(0.5, irrelevantTerms / 120);

    const score =
      relevance * 0.55 +
      mainBoost * 0.35 +
      Number(t.confidence_score || 0.5) * 0.15 -
      penalty;

    return {...t, score};
  }).filter(t => t.score > 0.25);

  scored.sort((a,b)=>b.score-a.score || b.confidence_score-a.confidence_score);
  return scored.slice(0,5);
}

function getMemories() {
  return db.prepare(`
    SELECT title, lesson, importance_score
    FROM alai_episodic_memories
    WHERE status='ACTIVE'
    ORDER BY importance_score DESC, created_at DESC
    LIMIT 3
  `).all() as any[];
}

function intent(q: string): string {
  const n = normalize(q);
  if (n.includes("compara")) return "COMPARE";
  if (n.includes("relacion")) return "RELATE";
  if (n.includes("sirve") || n.includes("para que")) return "USE";
  if (n.includes("que es")) return "DEFINE";
  return "EXPLAIN";
}

function compose(q: string, concepts: any[], beliefs: any[], relations: any[], traces: any[], memories: any[]): string {
  const mode = intent(q);
  const main = concepts[0];
  const secondary = concepts.slice(1,3);

  const lines: string[] = [];

  lines.push(`Respuesta de ALAI:`);
  lines.push(`Tema principal detectado: ${main ? main.name : "no identificado"}.`);

  if (mode === "DEFINE") {
    lines.push(`${main?.name || "El tema"} se entiende mejor combinando definición, relaciones, evidencia y uso.`);
  }

  if (mode === "RELATE" && main && secondary.length) {
    lines.push(`Relación principal: ${main.name} se conecta con ${secondary.map(x=>x.name).join(" y ")} porque comparten términos o aparecen cerca en el grafo conceptual.`);
  }

  if (mode === "COMPARE" && concepts.length >= 2) {
    lines.push(`Comparación: ${concepts[0].name} y ${concepts[1].name} deben distinguirse por función, estructura y contexto de uso.`);
  }

  if (mode === "USE") {
    lines.push(`Utilidad: ${main?.name || "el tema"} sirve para organizar conocimiento, aplicar habilidades y conectar conceptos previos con tareas más avanzadas.`);
  }

  if (beliefs.length) {
    lines.push(`Creencia verificada: ${beliefs[0].claim} Confianza ${Number(beliefs[0].confidence_score).toFixed(2)}.`);
  }

  const relevantRelations = relations
    .filter(r => concepts.some(c => r.fromName === c.name || r.toName === c.name))
    .slice(0,6);

  if (relevantRelations.length) {
    lines.push(`Relaciones relevantes:`);
    for (const r of relevantRelations) {
      lines.push(`- ${r.fromName} ${r.type} ${r.toName}`);
    }
  }

  if (traces.length) {
    lines.push(`Razonamiento: ${traces[0].public_reasoning} ${traces[0].conclusion}`);
  } else if (concepts.length >= 2) {
    lines.push(`Razonamiento: primero identifico el concepto central (${concepts[0].name}), luego lo conecto con ${concepts[1].name}, y finalmente explico por qué esa conexión responde la pregunta.`);
  }

  if (memories.length) {
    lines.push(`Control de calidad recordado: ${memories[0].lesson}`);
  }

  lines.push(`Conclusión: la mejor respuesta no debe depender de una definición aislada; debe usar conceptos relevantes, relaciones confiables, creencias con confianza y límites claros.`);

  return lines.join("\n");
}

function quality(answer: string, concepts: any[], beliefs: any[], relations: any[], traces: any[]) {
  const relevance = concepts.length ? 0.85 : 0.4;
  const grounding = beliefs.length || relations.length ? 0.85 : 0.45;
  const reasoning = traces.length || concepts.length >= 2 ? 0.82 : 0.5;
  const clarity = answer.length > 250 ? 0.84 : 0.6;
  return Number(((relevance + grounding + reasoning + clarity) / 4).toFixed(3));
}

const concepts = rankedConcepts(question);
const conceptIds = concepts.map(c => c.id);
const beliefs = getBeliefs(conceptIds);
const relations = getRelations(conceptIds);
const traces = getTraces(question, concepts);
const memories = getMemories();

const answer = compose(question, concepts, beliefs, relations, traces, memories);
const score = quality(answer, concepts, beliefs, relations, traces);

db.prepare(`
INSERT INTO alai_semantic_answer_runs
(id, question, selected_concepts, beliefs_used, relations_used, traces_used, memories_used, answer, quality_score, status, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?)
`).run(
  crypto.randomUUID(),
  question,
  JSON.stringify(concepts.map(c => ({id:c.id,name:c.name,score:c.score}))),
  beliefs.length,
  relations.length,
  traces.length,
  memories.length,
  answer,
  score,
  now
);

console.log("\n=== ALAI SEMANTIC ANSWER COMPOSER ===");
console.log({ selectedConcepts: concepts.map(c => c.name), qualityScore: score });
console.log("");
console.log(answer);
console.log("");

db.close();

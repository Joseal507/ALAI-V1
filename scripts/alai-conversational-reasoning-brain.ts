import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

const question = process.argv.slice(2).join(" ").trim();

if (!question) {
  console.error("Usage: npm run alai:conversational-reasoning -- \"your question\"");
  process.exit(1);
}

db.exec(`
CREATE TABLE IF NOT EXISTS alai_conversational_reasoning_runs (
  id TEXT PRIMARY KEY,
  user_question TEXT NOT NULL,
  detected_intent TEXT NOT NULL,
  selected_concept_id TEXT,
  selected_concept_name TEXT,
  memory_used INTEGER NOT NULL DEFAULT 0,
  beliefs_used INTEGER NOT NULL DEFAULT 0,
  reasoning_traces_used INTEGER NOT NULL DEFAULT 0,
  answer TEXT NOT NULL,
  self_score REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'COMPLETED',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alai_conversation_self_evaluations (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  clarity_score REAL NOT NULL,
  grounding_score REAL NOT NULL,
  reasoning_score REAL NOT NULL,
  usefulness_score REAL NOT NULL,
  total_score REAL NOT NULL,
  missing_gap TEXT NOT NULL DEFAULT '',
  action_taken TEXT NOT NULL DEFAULT '',
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

function detectIntent(q: string): string {
  const n = normalize(q);
  if (/\b(compara|compare|vs|diferencia|difference)\b/.test(n)) return "COMPARE";
  if (/\b(relacion|relate|connect|conecta|conexion)\b/.test(n)) return "RELATE";
  if (/\b(por que|why|causa|cause)\b/.test(n)) return "CAUSE_REASON";
  if (/\b(como|how|pasos|steps)\b/.test(n)) return "HOW_TO";
  if (/\b(que es|what is|define|definicion)\b/.test(n)) return "DEFINE";
  return "GENERAL_REASONING";
}

function terms(q: string): string[] {
  const stop = new Set([
    "que","es","la","el","los","las","un","una","de","del","con","y","o","a","en",
    "what","is","the","a","an","of","and","or","to","in","how","why","does",
    "relacion","relate","connect","compara","compare","vs","diferencia"
  ]);

  return normalize(q)
    .split(" ")
    .filter((t) => t.length >= 3 && !stop.has(t))
    .slice(0, 8);
}

function findConcept(q: string) {
  const ts = terms(q);
  if (ts.length === 0) return null;

  const exact = db.prepare(`
    SELECT id, name, status, confidence_score
    FROM concepts
    WHERE status IN ('CANONICAL','VERIFIED','PENDING')
      AND lower(name)=lower(?)
    ORDER BY CASE status WHEN 'CANONICAL' THEN 0 WHEN 'VERIFIED' THEN 1 ELSE 2 END
    LIMIT 1
  `);

  for (const t of ts) {
    const row = exact.get(t);
    if (row) return row as any;
  }

  const likeParts = ts.map(() => `lower(name) LIKE ?`).join(" OR ");
  const params = ts.map((t) => `%${t}%`);

  const row = db.prepare(`
    SELECT id, name, status, confidence_score
    FROM concepts
    WHERE status IN ('CANONICAL','VERIFIED','PENDING')
      AND (${likeParts})
    ORDER BY
      CASE status WHEN 'CANONICAL' THEN 0 WHEN 'VERIFIED' THEN 1 ELSE 2 END,
      confidence_score DESC
    LIMIT 1
  `).get(...params);

  return row as any;
}

function getBeliefs(conceptId: string | null, conceptName: string | null) {
  if (!conceptId && !conceptName) return [];

  const rows = db.prepare(`
    SELECT claim, confidence_score AS confidence, status
    FROM alai_beliefs
    WHERE subject_id=?
       OR lower(subject_name)=lower(?)
    ORDER BY confidence_score DESC
    LIMIT 5
  `).all(conceptId, conceptName) as any[];

  return rows;
}

function getMemories() {
  return db.prepare(`
    SELECT title, lesson, importance_score AS importance
    FROM alai_episodic_memories
    WHERE status='ACTIVE'
    ORDER BY importance_score DESC, created_at DESC
    LIMIT 5
  `).all() as any[];
}

function getReasoningTraces(conceptName: string | null, q: string) {
  const ts = terms(`${conceptName || ""} ${q}`);
  if (ts.length === 0) return [];

  const like = ts.map(() => `(lower(rt.public_reasoning) LIKE ? OR lower(rt.conclusion) LIKE ?)`).join(" OR ");
  const params = ts.flatMap((t) => [`%${t}%`, `%${t}%`]);

  return db.prepare(`
    SELECT rt.public_reasoning AS reasoning, rt.conclusion, rt.confidence_score AS confidence
    FROM alai_reasoning_traces rt
    WHERE ${like}
    ORDER BY rt.confidence_score DESC
    LIMIT 4
  `).all(...params) as any[];
}

function getRelations(conceptId: string | null) {
  if (!conceptId) return [];

  return db.prepare(`
    SELECT
      r.relation_type AS type,
      c2.name AS other,
      c2.status AS status
    FROM relations r
    JOIN concepts c2 ON c2.id = CASE
      WHEN r.from_concept_id=? THEN r.to_concept_id
      ELSE r.from_concept_id
    END
    WHERE r.from_concept_id=? OR r.to_concept_id=?
    GROUP BY c2.id, r.relation_type
    ORDER BY CASE c2.status WHEN 'CANONICAL' THEN 0 WHEN 'VERIFIED' THEN 1 ELSE 2 END
    LIMIT 8
  `).all(conceptId, conceptId, conceptId) as any[];
}

function buildAnswer(
  q: string,
  intent: string,
  concept: any,
  beliefs: any[],
  memories: any[],
  traces: any[],
  relations: any[]
): string {
  const conceptName = concept?.name || "el tema";
  const lines: string[] = [];

  if (intent === "DEFINE") {
    lines.push(`${conceptName} es un concepto que ALAI tiene registrado en su modelo de conocimiento.`);
  } else if (intent === "COMPARE") {
    lines.push(`Para comparar bien, ALAI busca diferencias y conexiones entre los conceptos mencionados.`);
  } else if (intent === "RELATE") {
    lines.push(`La relación se puede explicar conectando el concepto principal con sus dependencias, usos y conceptos vecinos.`);
  } else {
    lines.push(`Voy a responder usando memoria, creencias internas, relaciones del grafo y trazas de razonamiento.`);
  }

  if (beliefs.length > 0) {
    lines.push(`Creencia principal: ${beliefs[0].claim} Confianza: ${Number(beliefs[0].confidence).toFixed(2)}.`);
  }

  if (relations.length > 0) {
    lines.push(
      `Relaciones útiles: ` +
      relations.slice(0, 5).map((r) => `${conceptName} ${r.type} ${r.other}`).join("; ") +
      `.`
    );
  }

  if (traces.length > 0) {
    lines.push(`Razonamiento multi-paso: ${traces[0].reasoning} ${traces[0].conclusion}`);
  } else if (relations.length >= 2) {
    lines.push(
      `Razonamiento: si ${conceptName} se conecta con ${relations[0].other} y también con ${relations[1].other}, entonces una buena explicación debe mostrar cómo esas conexiones cambian el significado o uso del concepto.`
    );
  }

  if (memories.length > 0) {
    lines.push(`Lección operativa recordada: ${memories[0].lesson}`);
  }

  if (!concept) {
    lines.push(`No encontré un concepto exacto para la pregunta, así que esta respuesta debe tratarse como provisional y generar investigación si el usuario necesita más precisión.`);
  }

  lines.push(`Respuesta final: ${conceptName} debe explicarse no solo como definición, sino por sus relaciones, evidencia, aplicaciones y límites de confianza.`);

  return lines.join("\n");
}

function selfEvaluate(answer: string, concept: any, beliefs: any[], traces: any[], relations: any[]) {
  const clarity = answer.length > 120 ? 0.82 : 0.55;
  const grounding = concept && (beliefs.length > 0 || relations.length > 0) ? 0.86 : 0.45;
  const reasoning = traces.length > 0 || relations.length >= 2 ? 0.84 : 0.5;
  const usefulness = answer.includes("Respuesta final") ? 0.82 : 0.55;
  const total = Number(((clarity + grounding + reasoning + usefulness) / 4).toFixed(3));

  let gap = "";
  let action = "";

  if (total < 0.72) {
    gap = "Conversation answer lacked enough grounding or reasoning.";
    action = "CREATE_CONVERSATION_LEARNING_GAP";
  }

  return { clarity, grounding, reasoning, usefulness, total, gap, action };
}

const intent = detectIntent(question);
const concept = findConcept(question);
const conceptId = concept?.id || null;
const conceptName = concept?.name || null;

const beliefs = getBeliefs(conceptId, conceptName);
const memories = getMemories();
const traces = getReasoningTraces(conceptName, question);
const relations = getRelations(conceptId);

const answer = buildAnswer(question, intent, concept, beliefs, memories, traces, relations);
const evaluation = selfEvaluate(answer, concept, beliefs, traces, relations);

const runId = crypto.randomUUID();

db.prepare(`
INSERT INTO alai_conversational_reasoning_runs (
  id,
  user_question,
  detected_intent,
  selected_concept_id,
  selected_concept_name,
  memory_used,
  beliefs_used,
  reasoning_traces_used,
  answer,
  self_score,
  status,
  created_at
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?)
`).run(
  runId,
  question,
  intent,
  conceptId,
  conceptName,
  memories.length,
  beliefs.length,
  traces.length,
  answer,
  evaluation.total,
  now
);

db.prepare(`
INSERT INTO alai_conversation_self_evaluations (
  id,
  run_id,
  clarity_score,
  grounding_score,
  reasoning_score,
  usefulness_score,
  total_score,
  missing_gap,
  action_taken,
  created_at
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  crypto.randomUUID(),
  runId,
  evaluation.clarity,
  evaluation.grounding,
  evaluation.reasoning,
  evaluation.usefulness,
  evaluation.total,
  evaluation.gap,
  evaluation.action,
  now
);

if (evaluation.action === "CREATE_CONVERSATION_LEARNING_GAP") {
  db.prepare(`
    INSERT INTO alai_research_questions
    (id, concept_id, topic_id, question, question_type, priority_score, status, created_at, updated_at)
    VALUES (?, ?, NULL, ?, 'CONVERSATION_LEARNING_GAP', 0.93, 'OPEN', ?, ?)
  `).run(
    crypto.randomUUID(),
    conceptId,
    `What does ALAI need to learn to answer better: ${question}?`,
    now,
    now
  );
}

console.log("\n=== ALAI CONVERSATIONAL REASONING ===");
console.log({ intent, selectedConcept: conceptName, selfScore: evaluation.total });
console.log("");
console.log(answer);
console.log("");

db.close();

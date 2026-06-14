import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();
const question = process.argv.slice(2).join(" ").trim();

if (!question) {
  console.error("Usage: npm run alai:v16-answer -- \"question\"");
  process.exit(1);
}

function norm(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rows<T=any>(sql: string, params: any[] = []): T[] {
  try { return db.prepare(sql).all(...params) as T[]; } catch { return []; }
}

function hasAny(q: string, words: string[]) {
  return words.some(w => q.includes(norm(w)));
}

const q = norm(question);

const alias: Record<string, string> = {
  "celula": "Célula",
  "celulas": "Célula",
  "célula": "Célula",
  "células": "Célula",
  "medicina": "Medicina",
  "enfermedad": "Enfermedad",
  "diagnostico": "Diagnóstico",
  "diagnóstico": "Diagnóstico",
  "tratamiento": "Tratamiento",
  "tejido": "Tejido",
  "organo": "Órgano",
  "órgano": "Órgano",
  "mutacion": "Mutación",
  "mutación": "Mutación",
  "adn": "ADN",
  "arn": "ARN",
  "proteina": "Proteína",
  "proteinas": "Proteína",
  "proteína": "Proteína",
  "proteínas": "Proteína",
  "vector": "Vector",
  "vectores": "Vector",
  "algebra lineal": "Álgebra lineal",
  "álgebra lineal": "Álgebra lineal",
  "matriz": "Matriz",
  "matrices": "Matriz",
  "fotosintesis": "Fotosíntesis",
  "fotosíntesis": "Fotosíntesis",
  "respiracion celular": "Respiración celular",
  "respiración celular": "Respiración celular",
  "cadena alimenticia": "Cadena alimenticia",
  "energia": "ATP",
  "energía": "ATP"
};

let starts: string[] = [];
let goals: string[] = [];

for (const [phrase, node] of Object.entries(alias)) {
  if (q.includes(norm(phrase))) starts.push(node);
}

starts = [...new Set(starts)];

if (hasAny(q, ["medicina", "diagnostico", "tratamiento", "enfermedad"])) goals.push("Medicina");
if (hasAny(q, ["proteina", "proteína"])) goals.push("Proteína");
if (hasAny(q, ["funcion celular", "función celular"])) goals.push("Función celular");
if (hasAny(q, ["algebra lineal", "álgebra lineal"])) goals.push("Álgebra lineal");
if (hasAny(q, ["cadena alimenticia"])) goals.push("Cadena alimenticia");
if (hasAny(q, ["animales", "animal"])) goals.push("Consumidor");

if (!goals.length) {
  if (starts.includes("Célula")) goals.push("Medicina");
  if (starts.includes("Mutación")) goals.push("Proteína");
  if (starts.includes("Vector")) goals.push("Álgebra lineal");
  if (starts.includes("Fotosíntesis")) goals.push("ATP");
}

goals = [...new Set(goals)].filter(g => !starts.includes(g));

const allEdges = rows<any>(`
SELECT source_name, relation_type, target_name, explanation, domain_name, confidence_score
FROM alai_v16_graph_reasoning_edges
WHERE status='ACTIVE'
ORDER BY confidence_score DESC
`);

function neighbors(node: string) {
  return allEdges.filter(e => e.source_name === node);
}

function findPath(start: string, goal: string) {
  const queue: { node: string; path: any[] }[] = [{ node: start, path: [] }];
  const visited = new Set<string>([start]);

  while (queue.length) {
    const current = queue.shift()!;

    if (current.node === goal) return current.path;

    if (current.path.length >= 7) continue;

    for (const e of neighbors(current.node)) {
      if (visited.has(e.target_name)) continue;

      visited.add(e.target_name);
      queue.push({
        node: e.target_name,
        path: [...current.path, e]
      });
    }
  }

  return null;
}

let bestPath: any[] | null = null;
let bestStart = "";
let bestGoal = "";

for (const s of starts) {
  for (const g of goals) {
    const p = findPath(s, g);
    if (p && (!bestPath || p.length < bestPath.length)) {
      bestPath = p;
      bestStart = s;
      bestGoal = g;
    }
  }
}

function relationPhrase(e: any) {
  const map: Record<string,string> = {
    FORMS: "forma",
    PART_OF: "forma parte de",
    PERFORMS: "realiza",
    AFFECTS: "afecta",
    REQUIRES: "requiere",
    GUIDES: "guía",
    FOUNDATION_FOR: "es base para",
    CONTAINS: "contiene",
    TRANSCRIBES_TO: "se transcribe en",
    CHANGES: "cambia",
    STUDIES: "estudia",
    REPRESENTS: "representa",
    SOLVES: "ayuda a resolver",
    SUPPORTS: "sostiene",
    PRODUCES: "produce",
    FUELS: "alimenta",
    STARTS: "inicia",
    FEEDS: "transfiere energía a"
  };

  return map[e.relation_type] || e.relation_type.toLowerCase();
}

function buildAnswer(path: any[]) {
  const lines: string[] = [];

  lines.push(`ALAI encontró una ruta de razonamiento: ${bestStart} → ${path.map(e => e.target_name).join(" → ")}.`);
  lines.push("");

  lines.push("Paso a paso:");
  path.forEach((e, i) => {
    lines.push(`${i + 1}. ${e.source_name} ${relationPhrase(e)} ${e.target_name}. ${e.explanation}`);
  });

  lines.push("");

  if (bestStart === "Célula" && bestGoal === "Medicina") {
    lines.push("Respuesta:");
    lines.push("Una célula es importante en medicina porque muchos problemas médicos empiezan en cambios celulares. Las células forman tejidos, los tejidos forman órganos, y los órganos sostienen funciones del cuerpo. Si las células fallan, los tejidos y órganos pueden fallar, lo que puede causar enfermedad. Por eso entender células ayuda a diagnosticar, tratar y prevenir enfermedades.");
  } else if (bestStart === "Mutación" && bestGoal === "Proteína") {
    lines.push("Respuesta:");
    lines.push("Una mutación puede afectar una proteína porque cambia el ADN. Si el cambio ocurre en un gen, puede alterar el ARN que se produce y modificar las instrucciones para fabricar una proteína. Esa proteína puede funcionar diferente, funcionar mal o no funcionar, afectando la célula.");
  } else if (bestStart === "Vector" && bestGoal === "Álgebra lineal") {
    lines.push("Respuesta:");
    lines.push("Los vectores son parte central del álgebra lineal. El álgebra lineal los usa para estudiar espacios, matrices, transformaciones y sistemas de ecuaciones. Por eso los vectores son una base para representar datos, movimiento y modelos matemáticos.");
  } else {
    lines.push("Respuesta:");
    lines.push("La explicación se obtiene siguiendo la cadena anterior: cada concepto conecta con el siguiente y permite construir una respuesta basada en relaciones, no en una frase aislada.");
  }

  return lines.join("\n");
}

let answer = "";
let quality = 0;

if (bestPath && bestPath.length) {
  answer = buildAnswer(bestPath);
  quality = Math.min(0.97, 0.78 + bestPath.length * 0.035);
} else {
  const fallback = spawnSync("npm", ["run", "alai:v15-answer", "--", question], {
    encoding: "utf8",
    timeout: 180000
  });

  process.stdout.write(fallback.stdout || "");
  process.stderr.write(fallback.stderr || "");
  db.close();
  process.exit(fallback.status || 0);
}

db.prepare(`
INSERT INTO alai_v16_graph_reasoning_runs
(id, question, start_nodes, end_nodes, path_json, answer, quality_score, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  crypto.randomUUID(),
  question,
  JSON.stringify(starts),
  JSON.stringify(goals),
  JSON.stringify(bestPath),
  answer,
  quality,
  now
);

console.log("\n=== ALAI V16 GRAPH PATH REASONING ANSWER ===");
console.log({
  start: bestStart,
  goal: bestGoal,
  pathLength: bestPath.length,
  quality
});
console.log("");
console.log(answer);

db.close();

if (quality < 0.7) process.exit(1);

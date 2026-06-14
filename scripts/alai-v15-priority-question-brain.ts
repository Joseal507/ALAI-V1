import Database from "better-sqlite3";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const db = new Database("data/alai.db");
const now = new Date().toISOString();
const question = process.argv.slice(2).join(" ").trim();

if (!question) {
  console.error("Usage: npm run alai:v15-answer -- \"question\"");
  process.exit(1);
}

db.exec(`
CREATE TABLE IF NOT EXISTS alai_v15_priority_answer_runs (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  intent TEXT NOT NULL,
  target TEXT NOT NULL,
  answer TEXT NOT NULL,
  quality_score REAL NOT NULL,
  used_memory INTEGER NOT NULL DEFAULT 0,
  queued_learning INTEGER NOT NULL DEFAULT 0,
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

function runNpm(script: string, q: string, timeout = 120000) {
  return spawnSync("npm", ["run", script, "--", q], {
    encoding: "utf8",
    timeout
  });
}

function get<T=any>(sql: string, params: any[] = []): T | null {
  try { return db.prepare(sql).get(...params) as T; } catch { return null; }
}

function rows<T=any>(sql: string, params: any[] = []): T[] {
  try { return db.prepare(sql).all(...params) as T[]; } catch { return []; }
}

function queueLearning(q: string, reason: string) {
  try {
    db.prepare(`
      INSERT INTO alai_research_questions
      (id, concept_id, topic_id, question, question_type, priority_score, status, created_at, updated_at)
      VALUES (?, NULL, NULL, ?, 'PRIORITY_USER_DEMAND', 0.995, 'OPEN', ?, ?)
    `).run(
      crypto.randomUUID(),
      `Priority user-demand learning. Question: ${q}. Reason: ${reason}`,
      now,
      now
    );
  } catch {}
}

function detectIntent(q: string) {
  const n = norm(q);
  if (n.includes("por que") || n.includes("porque") || n.includes("importante")) return "WHY_IMPORTANT";
  if (n.includes("compara") || n.includes("diferencia")) return "COMPARE";
  if (n.includes("relacion") || n.includes("conect")) return "RELATE";
  if (n.includes("como") || n.includes("paso")) return "PROCESS";
  if (n.includes("que es") || n.startsWith("que ")) return "DEFINE";
  return "EXPLAIN";
}

const aliases: Record<string, string> = {
  "celula": "Célula",
  "celulas": "Célula",
  "célula": "Célula",
  "células": "Célula",
  "medicina": "Medicina",
  "vida": "Vida",
  "adn": "ADN",
  "arn": "ARN",
  "proteina": "Proteína",
  "proteinas": "Proteína",
  "mutacion": "Mutación",
  "mutación": "Mutación",
  "gen": "Gen",
  "genes": "Gen",
  "vector": "Vector",
  "vectores": "Vector",
  "escalar": "Escalar",
  "scalar": "Escalar",
  "algebra lineal": "Álgebra lineal",
  "álgebra lineal": "Álgebra lineal",
  "fotosintesis": "Fotosíntesis",
  "fotosíntesis": "Fotosíntesis",
  "respiracion celular": "Respiración celular",
  "cadena alimenticia": "Cadena alimenticia",
  "mitosis": "Mitosis",
  "meiosis": "Meiosis",
  "neurona": "Neurona",
  "neuronas": "Neurona",
  "sistema nervioso": "Sistema nervioso",
  "red neuronal": "Red neuronal",
  "messi": "Lionel Messi",
  "cristiano": "Cristiano Ronaldo",
  "cristiano ronaldo": "Cristiano Ronaldo"
};

function targetsFromQuestion(q: string): string[] {
  const n = norm(q);
  const found: string[] = [];

  for (const [phrase, target] of Object.entries(aliases)) {
    if (n.includes(norm(phrase))) found.push(target);
  }

  return [...new Set(found)];
}

function description(target: string): string {
  const c = get<any>(`
    SELECT description
    FROM concepts
    WHERE lower(name)=lower(?)
    LIMIT 1
  `, [target]);

  const d = String(c?.description || "").trim();

  if (
    d &&
    !d.toLowerCase().includes("concept discovered") &&
    !d.toLowerCase().includes("autonomous curriculum")
  ) return d;

  const known: Record<string, string> = {
    "Célula": "la unidad básica estructural y funcional de los seres vivos",
    "Vida": "el conjunto de procesos que permiten a un organismo mantenerse, crecer, responder y reproducirse",
    "Medicina": "el campo que estudia la salud, la enfermedad, el diagnóstico, el tratamiento y la prevención",
    "ADN": "la molécula que almacena información genética",
    "ARN": "la molécula que ayuda a copiar, transportar o usar información genética",
    "Proteína": "una molécula funcional producida siguiendo instrucciones genéticas",
    "Mutación": "un cambio en la secuencia del ADN",
    "Gen": "un segmento de ADN con instrucciones para un producto funcional",
    "Vector": "un objeto matemático que puede representar magnitud y dirección o una lista de valores",
    "Escalar": "una cantidad que solo tiene magnitud",
    "Álgebra lineal": "la rama de las matemáticas que estudia vectores, matrices, espacios vectoriales y transformaciones lineales",
    "Mitosis": "división celular que produce células hijas genéticamente iguales",
    "Meiosis": "división celular que produce células sexuales con la mitad de cromosomas",
    "Neurona": "una célula especializada que transmite información en el sistema nervioso",
    "Sistema nervioso": "red de órganos y células que recibe, procesa y transmite información",
    "Red neuronal": "modelo de machine learning que aprende ajustando pesos con datos"
  };

  return known[target] || "";
}

function answerDefinition(target: string) {
  const d = description(target);
  if (!d) return "";

  if (target === "Célula") {
    return [
      "Una célula es la unidad básica de los seres vivos.",
      "Es la estructura mínima capaz de realizar funciones vitales como obtener energía, crecer, responder al ambiente y reproducirse.",
      "Por eso, aunque existan organismos muy complejos, la vida se entiende desde lo que ocurre dentro de las células."
    ].join("\n");
  }

  return `${target} es ${d}.`;
}

function answerWhy(targets: string[], q: string) {
  const n = norm(q);

  if (targets.includes("Célula") && n.includes("unidad basica")) {
    return [
      "Una célula es la unidad básica de la vida porque es la estructura más pequeña que puede realizar funciones vitales.",
      "Un ser vivo necesita obtener energía, mantener equilibrio interno, responder al ambiente y reproducirse o participar en reproducción.",
      "La célula puede hacer esas funciones mediante sus componentes internos.",
      "Por eso, los tejidos, órganos y sistemas del cuerpo dependen de células funcionando correctamente."
    ].join("\n");
  }

  if (targets.includes("Célula") && targets.includes("Medicina")) {
    return [
      "Saber qué es una célula es fundamental en medicina porque muchas enfermedades comienzan con cambios celulares.",
      "Por ejemplo, el cáncer ocurre cuando células pierden control sobre su división; las infecciones afectan células; y muchas enfermedades genéticas alteran proteínas dentro de células.",
      "Entender la célula ayuda a comprender diagnóstico, tratamiento, medicamentos, tejidos, órganos y función del cuerpo.",
      "En resumen: la medicina estudia al paciente completo, pero muchas respuestas empiezan en la célula."
    ].join("\n");
  }

  if (targets.includes("Célula")) {
    return [
      "Estudiar las células es importante porque son la base de los seres vivos.",
      "Si entiendes cómo funciona una célula, puedes entender mejor tejidos, órganos, enfermedades, genética, metabolismo y medicina.",
      "También permite explicar cómo el cuerpo crece, se repara, obtiene energía y responde a problemas.",
      "En resumen: estudiar células ayuda a entender cómo funciona la vida desde su nivel más básico."
    ].join("\n");
  }

  return "";
}

function answerRelation(targets: string[]) {
  if (targets.includes("Vector") && targets.includes("Álgebra lineal")) {
    return [
      "Los vectores son uno de los objetos centrales del álgebra lineal.",
      "El álgebra lineal estudia vectores, matrices, espacios vectoriales y transformaciones lineales.",
      "Un vector puede representar dirección y magnitud, coordenadas, datos o estados de un sistema.",
      "Por eso, el álgebra lineal usa vectores para resolver sistemas de ecuaciones, representar movimiento, transformar espacios y modelar datos."
    ].join("\n");
  }

  if (targets.includes("ADN") && targets.includes("Proteína")) {
    return [
      "El ADN se relaciona con las proteínas porque contiene instrucciones para producirlas.",
      "Un gen, que es una parte del ADN, puede transcribirse en ARN.",
      "Luego ese ARN ayuda a fabricar una proteína.",
      "Así, la información genética puede convertirse en una molécula funcional que afecta la célula."
    ].join("\n");
  }

  if (targets.includes("Neurona") && targets.includes("Sistema nervioso")) {
    return [
      "Las neuronas son células principales del sistema nervioso.",
      "Su función es recibir, procesar y transmitir información mediante señales eléctricas y químicas.",
      "El sistema nervioso funciona porque muchas neuronas se conectan formando redes.",
      "En resumen: el sistema nervioso es la red; las neuronas son las unidades que transmiten los mensajes."
    ].join("\n");
  }

  return "";
}

function answerCompare(targets: string[]) {
  if (targets.includes("Mitosis") && targets.includes("Meiosis")) {
    return [
      "Mitosis y meiosis son procesos de división celular, pero tienen objetivos diferentes.",
      "La mitosis produce dos células hijas genéticamente iguales y sirve para crecimiento, reparación y reemplazo celular.",
      "La meiosis produce células sexuales, como óvulos o espermatozoides, con la mitad de cromosomas.",
      "Además, la meiosis genera variabilidad genética.",
      "En resumen: mitosis conserva la información; meiosis reduce cromosomas y genera diversidad."
    ].join("\n");
  }

  if (targets.includes("ADN") && targets.includes("ARN")) {
    return [
      "ADN y ARN están relacionados, pero no son lo mismo.",
      "El ADN almacena la información genética de forma más estable.",
      "El ARN ayuda a copiar, transportar o usar esa información para producir proteínas.",
      "En resumen: el ADN guarda las instrucciones; el ARN ayuda a ejecutar esas instrucciones."
    ].join("\n");
  }

  if (targets.includes("Vector") && targets.includes("Escalar")) {
    return [
      "Un escalar es una cantidad que solo tiene magnitud, como masa, temperatura o tiempo.",
      "Un vector tiene magnitud y dirección, como fuerza, velocidad o desplazamiento.",
      "Ejemplo: 10 metros es una magnitud; 10 metros hacia el norte es un vector.",
      "En resumen: escalar = cuánto; vector = cuánto y hacia dónde."
    ].join("\n");
  }

  return "";
}

function answerProcess(targets: string[], q: string) {
  const n = norm(q);

  if (targets.includes("Mutación") && targets.includes("Proteína")) {
    return [
      "Una mutación puede afectar una proteína porque cambia la información del ADN.",
      "1. Primero ocurre un cambio en la secuencia del ADN.",
      "2. Si ese cambio está dentro de un gen, puede alterar el ARN que se produce.",
      "3. Ese ARN puede cambiar las instrucciones usadas para fabricar una proteína.",
      "4. La proteína puede salir normal, alterada, incompleta o no funcionar.",
      "5. Si la proteína cambia mucho, también puede cambiar una función celular.",
      "En resumen: mutación en ADN → cambio en ARN → cambio en proteína → posible cambio en función celular."
    ].join("\n");
  }

  if (targets.includes("Neurona") && n.includes("informacion")) {
    return [
      "Una neurona transmite información mediante señales eléctricas y químicas.",
      "Primero recibe señales por las dendritas.",
      "Luego integra esa información en el cuerpo celular.",
      "Si la señal es suficiente, viaja un impulso eléctrico por el axón.",
      "Al final, la neurona libera neurotransmisores que comunican la señal a otra célula.",
      "En resumen: recibe señal → genera impulso → libera mensajeros químicos → transmite información."
    ].join("\n");
  }

  return "";
}

function answerMessiCristiano(targets: string[]) {
  if (targets.includes("Lionel Messi") && targets.includes("Cristiano Ronaldo")) {
    return [
      "Depende del criterio, pero se puede defender que Messi es mejor que Cristiano si valoras más creación de juego, visión, regate, pase, control del ritmo y participación en la construcción del ataque.",
      "Messi no solo finaliza jugadas: también crea oportunidades, rompe líneas y organiza el juego.",
      "Cristiano tiene un argumento enorme si valoras remate, físico, juego aéreo, mentalidad competitiva y capacidad goleadora.",
      "Conclusión: Messi suele tener el argumento más fuerte como jugador total; Cristiano tiene uno de los argumentos más fuertes como finalizador histórico."
    ].join("\n");
  }

  return "";
}

function buildPriorityAnswer() {
  const intent = detectIntent(question);
  const targets = targetsFromQuestion(question);

  let answer = "";

  if (intent === "WHY_IMPORTANT") answer = answerWhy(targets, question);
  if (!answer && intent === "RELATE") answer = answerRelation(targets);
  if (!answer && intent === "COMPARE") answer = answerCompare(targets);
  if (!answer && intent === "PROCESS") answer = answerProcess(targets, question);
  if (!answer) answer = answerMessiCristiano(targets);
  if (!answer && intent === "DEFINE" && targets.length) answer = answerDefinition(targets[0]);

  if (answer) {
    queueLearning(question, "Answered immediately by V15 priority brain; should still be grounded into permanent graph.");
    return {
      ok: true,
      intent,
      targets,
      answer,
      quality: 0.9
    };
  }

  return {
    ok: false,
    intent,
    targets,
    answer: "",
    quality: 0.0
  };
}

const priority = buildPriorityAnswer();

if (priority.ok) {
  db.prepare(`
    INSERT INTO alai_v15_priority_answer_runs
    (id, question, intent, target, answer, quality_score, used_memory, queued_learning, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?)
  `).run(
    crypto.randomUUID(),
    question,
    priority.intent,
    priority.targets.join(", "),
    priority.answer,
    priority.quality,
    now
  );

  console.log("\n=== ALAI V15 PRIORITY QUESTION BRAIN ===");
  console.log({
    intent: priority.intent,
    targets: priority.targets,
    quality: priority.quality,
    queuedLearning: true
  });
  console.log("");
  console.log(priority.answer);

  db.close();
  process.exit(0);
}

const fallback = runNpm("alai:v14-answer", question, 180000);
process.stdout.write(fallback.stdout || "");
process.stderr.write(fallback.stderr || "");

db.close();
process.exit(fallback.status || 0);

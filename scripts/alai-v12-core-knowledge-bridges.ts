import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_v12_explanatory_edges (
  id TEXT PRIMARY KEY,
  source_name TEXT NOT NULL,
  relation_phrase TEXT NOT NULL,
  target_name TEXT NOT NULL,
  explanation TEXT NOT NULL,
  domain_name TEXT NOT NULL DEFAULT '',
  confidence_score REAL NOT NULL DEFAULT 0.9,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(source_name, relation_phrase, target_name)
);
`);

function ensureConcept(name: string, description: string, status = "VERIFIED") {
  const existing = db.prepare(`SELECT id FROM concepts WHERE lower(name)=lower(?) LIMIT 1`).get(name) as any;
  if (existing?.id) return existing.id;

  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO concepts (id, name, description, status, confidence_score, created_at, updated_at)
    VALUES (?, ?, ?, ?, 0.82, ?, ?)
  `).run(id, name, description, status, now, now);
  return id;
}

function edge(source: string, relation: string, target: string, explanation: string, domain: string) {
  db.prepare(`
    INSERT INTO alai_v12_explanatory_edges
    (id, source_name, relation_phrase, target_name, explanation, domain_name, confidence_score, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 0.94, 'ACTIVE', ?, ?)
    ON CONFLICT(source_name, relation_phrase, target_name) DO UPDATE SET
      explanation=excluded.explanation,
      domain_name=excluded.domain_name,
      confidence_score=excluded.confidence_score,
      status='ACTIVE',
      updated_at=excluded.updated_at
  `).run(crypto.randomUUID(), source, relation, target, explanation, domain, now, now);
}

const concepts = [
  ["Fotosíntesis", "Proceso biológico por el cual plantas, algas y algunas bacterias convierten energía luminosa en energía química."],
  ["Luz solar", "Energía proveniente del Sol que puede ser usada por productores fotosintéticos."],
  ["Agua", "Molécula usada en la fotosíntesis como fuente de electrones e hidrógeno."],
  ["Dióxido de carbono", "Gas usado por organismos fotosintéticos para formar moléculas orgánicas."],
  ["Glucosa", "Azúcar que almacena energía química y puede usarse como fuente de energía celular."],
  ["Oxígeno", "Gas liberado durante la fotosíntesis y usado por muchos organismos en respiración celular."],
  ["Respiración celular", "Proceso celular que libera energía utilizable desde moléculas como la glucosa."],
  ["ATP", "Molécula usada por las células como fuente inmediata de energía."],
  ["Cadena alimenticia", "Secuencia que muestra cómo fluye energía y materia entre organismos."],
  ["Productor", "Organismo que fabrica su propio alimento, como plantas y algas."],
  ["Consumidor", "Organismo que obtiene energía alimentándose de otros seres vivos."],
  ["Animal", "Ser vivo consumidor que obtiene energía comiendo plantas u otros organismos."],
  ["ADN", "Molécula que almacena información genética."],
  ["ARN", "Molécula que copia o transporta información genética para ayudar a producir proteínas."],
  ["Proteína", "Molécula funcional producida siguiendo instrucciones genéticas."],
  ["Gen", "Segmento de ADN que contiene instrucciones para un producto funcional."],
  ["Ecuación lineal", "Ecuación donde la variable principal aparece con potencia 1."],
  ["Variable", "Símbolo que representa un valor desconocido o cambiante."],
  ["Pendiente", "Medida de cambio constante en una relación lineal."],
  ["Red neuronal", "Modelo de machine learning formado por unidades conectadas que ajustan pesos para aprender patrones."],
  ["Pesos", "Parámetros ajustables de una red neuronal."],
  ["Datos de entrenamiento", "Ejemplos usados para que un modelo aprenda patrones."],
  ["Error", "Diferencia entre la salida del modelo y la respuesta esperada."],
  ["Predicción", "Salida que produce un modelo a partir de datos de entrada."]
];

for (const [name, desc] of concepts) ensureConcept(name, desc);

const edges = [
  ["Luz solar", "entrega energía a", "Fotosíntesis", "La fotosíntesis comienza cuando un productor captura energía luminosa.", "Biology"],
  ["Fotosíntesis", "usa", "Agua", "El agua participa en el proceso fotosintético.", "Biology"],
  ["Fotosíntesis", "usa", "Dióxido de carbono", "El dióxido de carbono aporta carbono para formar moléculas orgánicas.", "Biology"],
  ["Fotosíntesis", "produce", "Glucosa", "La glucosa almacena energía química producida a partir de la luz.", "Biology"],
  ["Fotosíntesis", "libera", "Oxígeno", "El oxígeno se libera como resultado del proceso fotosintético.", "Biology"],
  ["Glucosa", "alimenta", "Respiración celular", "La respiración celular puede usar glucosa para obtener energía.", "Biology"],
  ["Respiración celular", "produce", "ATP", "El ATP es energía utilizable para procesos celulares.", "Biology"],
  ["Productor", "usa", "Fotosíntesis", "Los productores como plantas y algas fabrican alimento mediante fotosíntesis.", "Biology"],
  ["Productor", "inicia", "Cadena alimenticia", "La energía de muchas cadenas alimenticias empieza en productores.", "Biology"],
  ["Cadena alimenticia", "transfiere energía a", "Consumidor", "Los consumidores reciben energía comiendo productores u otros consumidores.", "Biology"],
  ["Consumidor", "incluye", "Animal", "Los animales son consumidores porque obtienen energía alimentándose.", "Biology"],

  ["ADN", "contiene", "Gen", "Los genes son segmentos de ADN con instrucciones funcionales.", "Genetics"],
  ["Gen", "se transcribe en", "ARN", "La información genética puede copiarse desde ADN hacia ARN.", "Genetics"],
  ["ARN", "ayuda a producir", "Proteína", "La célula usa ARN para guiar la fabricación de proteínas.", "Genetics"],
  ["Proteína", "ejecuta", "Función celular", "Las proteínas realizan muchas funciones estructurales y químicas en células.", "Genetics"],

  ["Ecuación lineal", "usa", "Variable", "Una ecuación lineal relaciona variables con potencia 1.", "Mathematics"],
  ["Ecuación lineal", "tiene", "Pendiente", "La pendiente describe cambio constante en una relación lineal.", "Mathematics"],
  ["Pendiente", "representa", "Cambio constante", "En una línea, la pendiente muestra cuánto cambia una variable por otra.", "Mathematics"],

  ["Red neuronal", "aprende con", "Datos de entrenamiento", "La red recibe ejemplos para ajustar su comportamiento.", "AI"],
  ["Red neuronal", "ajusta", "Pesos", "Los pesos cambian para mejorar el resultado.", "AI"],
  ["Predicción", "se compara con", "Respuesta esperada", "El modelo evalúa qué tan buena fue su salida.", "AI"],
  ["Error", "guía ajuste de", "Pesos", "El error indica cómo modificar los pesos para mejorar.", "AI"],
  ["Pesos", "mejoran", "Predicción", "Al ajustar pesos, la red mejora sus predicciones.", "AI"]
];

for (const e of edges) edge(e[0], e[1], e[2], e[3], e[4]);

console.log("ALAI V12 core knowledge bridges installed.");
console.log({ concepts: concepts.length, edges: edges.length });

db.close();

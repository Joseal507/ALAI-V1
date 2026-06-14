import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_v16_graph_reasoning_edges (
  id TEXT PRIMARY KEY,
  source_name TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  target_name TEXT NOT NULL,
  explanation TEXT NOT NULL,
  domain_name TEXT NOT NULL DEFAULT '',
  confidence_score REAL NOT NULL DEFAULT 0.9,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(source_name, relation_type, target_name)
);

CREATE TABLE IF NOT EXISTS alai_v16_graph_reasoning_runs (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  start_nodes TEXT NOT NULL,
  end_nodes TEXT NOT NULL,
  path_json TEXT NOT NULL,
  answer TEXT NOT NULL,
  quality_score REAL NOT NULL,
  created_at TEXT NOT NULL
);
`);

function ensureConcept(name: string, description: string) {
  const existing = db.prepare(`SELECT id FROM concepts WHERE lower(name)=lower(?) LIMIT 1`).get(name) as any;
  if (existing?.id) return existing.id;

  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO concepts (id, name, description, status, confidence_score, created_at, updated_at)
    VALUES (?, ?, ?, 'VERIFIED', 0.86, ?, ?)
  `).run(id, name, description, now, now);

  return id;
}

function edge(source: string, relation: string, target: string, explanation: string, domain: string) {
  db.prepare(`
    INSERT INTO alai_v16_graph_reasoning_edges
    (id, source_name, relation_type, target_name, explanation, domain_name, confidence_score, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 0.94, 'ACTIVE', ?, ?)
    ON CONFLICT(source_name, relation_type, target_name) DO UPDATE SET
      explanation=excluded.explanation,
      domain_name=excluded.domain_name,
      confidence_score=excluded.confidence_score,
      status='ACTIVE',
      updated_at=excluded.updated_at
  `).run(crypto.randomUUID(), source, relation, target, explanation, domain, now, now);
}

const concepts = [
  ["Célula", "Unidad básica estructural y funcional de los seres vivos."],
  ["Tejido", "Conjunto de células organizadas que cumplen una función."],
  ["Órgano", "Estructura formada por tejidos que realiza funciones específicas."],
  ["Sistema corporal", "Conjunto de órganos que trabajan juntos para cumplir funciones del organismo."],
  ["Organismo", "Ser vivo formado por una o más células."],
  ["Enfermedad", "Alteración del funcionamiento normal del cuerpo o de sus partes."],
  ["Diagnóstico", "Proceso para identificar una enfermedad o condición."],
  ["Tratamiento", "Intervención para mejorar, controlar o curar una enfermedad."],
  ["Medicina", "Campo que estudia salud, enfermedad, diagnóstico, tratamiento y prevención."],
  ["Función celular", "Actividad que realiza una célula para mantenerse viva o cumplir un papel."],
  ["Mutación", "Cambio en la secuencia del ADN."],
  ["ADN", "Molécula que almacena información genética."],
  ["Gen", "Segmento de ADN con instrucciones para un producto funcional."],
  ["ARN", "Molécula que ayuda a copiar o usar información genética."],
  ["Proteína", "Molécula funcional producida a partir de instrucciones genéticas."],
  ["Fenotipo", "Características observables que resultan de genes, ambiente y función biológica."],
  ["Vector", "Objeto matemático que representa magnitud y dirección o una lista de valores."],
  ["Álgebra lineal", "Rama matemática que estudia vectores, matrices y transformaciones lineales."],
  ["Matriz", "Arreglo rectangular de números usado para representar transformaciones o datos."],
  ["Transformación lineal", "Función que transforma vectores preservando estructura lineal."],
  ["Sistema de ecuaciones", "Conjunto de ecuaciones que se resuelven juntas."],
  ["Modelo matemático", "Representación matemática de una situación real."],
  ["Fotosíntesis", "Proceso que transforma energía luminosa en energía química."],
  ["Glucosa", "Molécula que almacena energía química."],
  ["Respiración celular", "Proceso que libera energía utilizable desde moléculas como glucosa."],
  ["ATP", "Molécula de energía inmediata para la célula."],
  ["Cadena alimenticia", "Ruta por la que fluye energía entre seres vivos."],
  ["Productor", "Organismo que fabrica su propio alimento."],
  ["Consumidor", "Organismo que obtiene energía alimentándose de otros seres vivos."]
];

for (const [name, desc] of concepts) ensureConcept(name, desc);

const edges = [
  ["Célula", "FORMS", "Tejido", "Las células se organizan para formar tejidos especializados.", "Medicine"],
  ["Tejido", "FORMS", "Órgano", "Los tejidos se combinan para construir órganos.", "Medicine"],
  ["Órgano", "PART_OF", "Sistema corporal", "Los órganos trabajan dentro de sistemas corporales.", "Medicine"],
  ["Sistema corporal", "PART_OF", "Organismo", "Los sistemas corporales sostienen el funcionamiento del organismo.", "Medicine"],
  ["Célula", "PERFORMS", "Función celular", "Las células realizan funciones vitales como energía, comunicación y reparación.", "Medicine"],
  ["Función celular", "AFFECTS", "Tejido", "Si muchas células fallan, el tejido puede perder función.", "Medicine"],
  ["Tejido", "AFFECTS", "Órgano", "El estado del tejido afecta el funcionamiento del órgano.", "Medicine"],
  ["Órgano", "AFFECTS", "Enfermedad", "Cuando un órgano falla o cambia, puede aparecer enfermedad.", "Medicine"],
  ["Enfermedad", "REQUIRES", "Diagnóstico", "La medicina busca diagnosticar la causa de los síntomas o alteraciones.", "Medicine"],
  ["Diagnóstico", "GUIDES", "Tratamiento", "El diagnóstico orienta qué tratamiento usar.", "Medicine"],
  ["Tratamiento", "PART_OF", "Medicina", "El tratamiento es una parte central de la medicina.", "Medicine"],
  ["Célula", "FOUNDATION_FOR", "Medicina", "Muchas enfermedades, diagnósticos y tratamientos se entienden desde cambios celulares.", "Medicine"],

  ["ADN", "CONTAINS", "Gen", "Los genes son segmentos de ADN con instrucciones funcionales.", "Genetics"],
  ["Gen", "TRANSCRIBES_TO", "ARN", "La información de un gen puede copiarse en ARN.", "Genetics"],
  ["ARN", "GUIDES", "Proteína", "El ARN puede guiar la fabricación de proteínas.", "Genetics"],
  ["Proteína", "PERFORMS", "Función celular", "Las proteínas ejecutan funciones dentro de células.", "Genetics"],
  ["Mutación", "CHANGES", "ADN", "Una mutación cambia la secuencia del ADN.", "Genetics"],
  ["ADN", "AFFECTS", "Proteína", "Cambios en ADN pueden alterar proteínas si afectan genes.", "Genetics"],
  ["Proteína", "AFFECTS", "Fenotipo", "Proteínas alteradas pueden cambiar características observables o funciones.", "Genetics"],
  ["Fenotipo", "AFFECTS", "Enfermedad", "Cambios funcionales pueden contribuir a enfermedad.", "Genetics"],

  ["Vector", "PART_OF", "Álgebra lineal", "Los vectores son objetos centrales del álgebra lineal.", "Mathematics"],
  ["Álgebra lineal", "STUDIES", "Matriz", "El álgebra lineal estudia matrices y operaciones con ellas.", "Mathematics"],
  ["Matriz", "REPRESENTS", "Transformación lineal", "Las matrices pueden representar transformaciones lineales.", "Mathematics"],
  ["Álgebra lineal", "SOLVES", "Sistema de ecuaciones", "El álgebra lineal permite resolver sistemas de ecuaciones.", "Mathematics"],
  ["Sistema de ecuaciones", "SUPPORTS", "Modelo matemático", "Los sistemas de ecuaciones ayudan a modelar situaciones reales.", "Mathematics"],

  ["Fotosíntesis", "PRODUCES", "Glucosa", "La fotosíntesis produce glucosa que almacena energía química.", "Biology"],
  ["Glucosa", "FUELS", "Respiración celular", "La respiración celular puede usar glucosa para liberar energía.", "Biology"],
  ["Respiración celular", "PRODUCES", "ATP", "La respiración celular produce ATP para funciones celulares.", "Biology"],
  ["ATP", "SUPPORTS", "Función celular", "El ATP permite que la célula realice trabajo biológico.", "Biology"],
  ["Fotosíntesis", "SUPPORTS", "Productor", "Los productores usan fotosíntesis para fabricar alimento.", "Biology"],
  ["Productor", "STARTS", "Cadena alimenticia", "Los productores suelen iniciar cadenas alimenticias.", "Biology"],
  ["Cadena alimenticia", "FEEDS", "Consumidor", "La energía pasa a consumidores cuando comen productores u otros organismos.", "Biology"]
];

for (const e of edges) edge(e[0], e[1], e[2], e[3], e[4]);

console.log("ALAI V16 graph reasoning core installed.");
console.log({ concepts: concepts.length, edges: edges.length });

db.close();

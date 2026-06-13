import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_v7_entity_aliases (
  id TEXT PRIMARY KEY,
  phrase TEXT NOT NULL UNIQUE,
  canonical_name TEXT NOT NULL,
  domain_hint TEXT NOT NULL DEFAULT '',
  priority_score REAL NOT NULL DEFAULT 0.9,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);

const aliases = [
  ["fotosintesis", "fotosintesis", "biology"],
  ["photosynthesis", "fotosintesis", "biology"],
  ["respiracion celular", "Cellular Respiration", "biology"],
  ["cadena alimenticia", "Food Chain", "biology"],
  ["energia del sol", "Solar Energy", "biology"],
  ["animales", "Animal", "biology"],
  ["animal", "Animal", "biology"],
  ["neurona", "Neuron", "biology"],
  ["sistema nervioso", "Nervous System", "biology"],
  ["adn", "DNA", "genetics"],
  ["arn", "RNA", "genetics"],
  ["genetica", "Genetics", "genetics"],
  ["genética", "Genetics", "genetics"],
  ["mitosis", "Mitosis", "biology"],
  ["meiosis", "Meiosis", "biology"],
  ["vector", "Vector", "math"],
  ["scalar", "Scalar", "math"],
  ["escalar", "Scalar", "math"],
  ["linear algebra", "Linear Algebra", "math"],
  ["algebra lineal", "Linear Algebra", "math"],
  ["machine learning", "Machine Learning", "ai"],
  ["deep learning", "Deep Learning", "ai"],
  ["ecosistema", "Ecosistema", "biology"],
  ["ecosystem", "Ecosistema", "biology"]
];

let inserted = 0;

for (const a of aliases) {
  const r = db.prepare(`
    INSERT INTO alai_v7_entity_aliases
    (id, phrase, canonical_name, domain_hint, priority_score, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 0.95, 'ACTIVE', ?, ?)
    ON CONFLICT(phrase) DO UPDATE SET
      canonical_name=excluded.canonical_name,
      domain_hint=excluded.domain_hint,
      priority_score=excluded.priority_score,
      status='ACTIVE',
      updated_at=excluded.updated_at
  `).run(crypto.randomUUID(), a[0], a[1], a[2], now, now);
  inserted += r.changes;
}

console.log("ALAI V7 entity linker aliases installed.");
console.log({ insertedOrUpdated: inserted });

db.close();

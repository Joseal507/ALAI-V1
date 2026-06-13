import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_v8_chat_bridge_rules (
  id TEXT PRIMARY KEY,
  trigger_phrase TEXT NOT NULL,
  target_concept TEXT NOT NULL,
  reason TEXT NOT NULL,
  priority_score REAL NOT NULL DEFAULT 0.9,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(trigger_phrase, target_concept)
);
`);

const aliases = [
  ["oxigeno", "Oxygen", "biology"],
  ["oxígeno", "Oxygen", "biology"],
  ["oxygen", "Oxygen", "biology"],
  ["ecuacion lineal", "Linear Equation", "math"],
  ["ecuación lineal", "Linear Equation", "math"],
  ["linear equation", "Linear Equation", "math"],
  ["red neuronal", "Neural Network", "ai"],
  ["redes neuronales", "Neural Network", "ai"],
  ["neural network", "Neural Network", "ai"],
  ["arn", "RNA", "genetics"],
  ["rna", "RNA", "genetics"],
  ["proteina", "Protein", "biology"],
  ["proteína", "Protein", "biology"],
  ["proteinas", "Protein", "biology"],
  ["proteínas", "Protein", "biology"]
];

for (const a of aliases) {
  db.prepare(`
    INSERT INTO alai_v7_entity_aliases
    (id, phrase, canonical_name, domain_hint, priority_score, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 0.99, 'ACTIVE', ?, ?)
    ON CONFLICT(phrase) DO UPDATE SET
      canonical_name=excluded.canonical_name,
      domain_hint=excluded.domain_hint,
      priority_score=excluded.priority_score,
      status='ACTIVE',
      updated_at=excluded.updated_at
  `).run(crypto.randomUUID(), a[0], a[1], a[2], now, now);
}

const bridges = [
  ["energia del sol", "Solar Energy", "User asks about energy origin."],
  ["energia del sol", "fotosintesis", "Solar energy reaches life through photosynthesis."],
  ["energia del sol", "Food Chain", "Energy moves through food chains."],
  ["energia del sol", "Animal", "Question asks about animals."],
  ["fotosintesis produce oxigeno", "fotosintesis", "Question asks photosynthesis mechanism."],
  ["fotosintesis produce oxigeno", "Oxygen", "Question asks oxygen production."],
  ["adn arn proteinas", "DNA", "Central dogma starts with DNA."],
  ["adn arn proteinas", "RNA", "RNA connects DNA to protein synthesis."],
  ["adn arn proteinas", "Protein", "Proteins are final expression product."],
  ["red neuronal aprende", "Neural Network", "Question asks neural network learning."],
  ["ecuacion lineal", "Linear Equation", "Question asks linear equation."]
];

for (const b of bridges) {
  db.prepare(`
    INSERT INTO alai_v8_chat_bridge_rules
    (id, trigger_phrase, target_concept, reason, priority_score, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 0.96, 'ACTIVE', ?, ?)
    ON CONFLICT(trigger_phrase, target_concept) DO UPDATE SET
      reason=excluded.reason,
      priority_score=excluded.priority_score,
      status='ACTIVE',
      updated_at=excluded.updated_at
  `).run(crypto.randomUUID(), b[0], b[1], b[2], now, now);
}

db.exec(`
UPDATE concepts
SET status='REJECTED',
    updated_at=datetime('now')
WHERE lower(name) IN (
  'ox',
  'red-blue-red-blue',
  'green-red component (a*)'
);
`);

console.log("ALAI V8 chat grounding repair completed.");
console.log({ aliases: aliases.length, bridges: bridges.length });

db.close();

import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

const phrases = [
  [
    "en",
    "es",
    "Torque changes angular momentum over time.",
    "El torque cambia el momento angular con el tiempo.",
    "DOMAIN",
  ],
  [
    "en",
    "es",
    "torque changes angular momentum",
    "el torque cambia el momento angular",
    "DOMAIN",
  ],
  [
    "en",
    "es",
    "torque can change how something spins",
    "el torque puede cambiar cómo gira algo",
    "DOMAIN",
  ],
  [
    "en",
    "es",
    "Angular Momentum is connected back through CHANGES Torque",
    "El momento angular se conecta de vuelta con el torque mediante una relación de cambio",
    "REASONING",
  ],
  [
    "en",
    "es",
    "Torque CHANGES Angular Momentum",
    "El torque CAMBIA el momento angular",
    "REASONING",
  ],
  [
    "en",
    "es",
    "Reverse path",
    "Camino inverso",
    "REASONING",
  ],
];

let inserted = 0;
let skipped = 0;

for (const [sourceLanguage, targetLanguage, sourcePhrase, targetPhrase, phraseType] of phrases) {
  const existing = db.prepare(`
    SELECT id FROM language_phrases
    WHERE source_language = ?
      AND target_language = ?
      AND lower(source_phrase) = lower(?)
    LIMIT 1
  `).get(sourceLanguage, targetLanguage, sourcePhrase) as { id: string } | undefined;

  if (existing) {
    skipped++;
    continue;
  }

  db.prepare(`
    INSERT INTO language_phrases (
      id,
      source_language,
      target_language,
      source_phrase,
      target_phrase,
      phrase_type,
      confidence_score,
      usage_count,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    sourceLanguage,
    targetLanguage,
    sourcePhrase,
    targetPhrase,
    phraseType,
    0.45,
    0,
    now,
    now
  );

  inserted++;
}

console.log("Language phrase seed completed.");
console.log({ inserted, skipped });

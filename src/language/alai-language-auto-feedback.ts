import Database from "better-sqlite3";
import crypto from "node:crypto";

type FeedbackRule = {
  badPattern: string;
  correction: string;
  reason: string;
};

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function detectAtomicFeedback(answer: string): FeedbackRule[] {
  const rules: FeedbackRule[] = [];
  const text = normalize(answer);

  if (text.includes("internal confidence")) {
    rules.push({
      badPattern: "Internal confidence:",
      correction: "Confianza interna:",
      reason: "Translate internal confidence label to Spanish when answering in Spanish.",
    });
  }

  if (text.includes("reasoning from alai's graph")) {
    rules.push({
      badPattern: "Reasoning from ALAI's graph:",
      correction: "Razonamiento interno:",
      reason: "Avoid English implementation wording in Spanish answers.",
    });
  }

  if (text.includes("dentro de alai")) {
    rules.push({
      badPattern: "dentro de ALAI",
      correction: "conceptualmente",
      reason: "Avoid mechanical self-reference.",
    });
  }

  return rules;
}

export function learnLanguageFeedbackFromOwnAnswer(
  db: Database.Database,
  answer: string
): void {
  const rules = detectAtomicFeedback(answer);
  if (rules.length === 0) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS alai_language_feedback (
      id TEXT PRIMARY KEY,
      bad_pattern TEXT NOT NULL,
      correction TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const now = new Date().toISOString();

  for (const rule of rules) {
    const existing = db.prepare(`
      SELECT id
      FROM alai_language_feedback
      WHERE bad_pattern = ?
        AND correction = ?
      LIMIT 1
    `).get(rule.badPattern, rule.correction);

    if (existing) continue;

    db.prepare(`
      INSERT INTO alai_language_feedback (
        id, bad_pattern, correction, reason, status, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)
    `).run(
      crypto.randomUUID(),
      rule.badPattern,
      rule.correction,
      rule.reason,
      now,
      now
    );
  }
}

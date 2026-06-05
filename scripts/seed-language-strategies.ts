import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

const strategies = [
  ["natural_language", "Make the answer sound human, natural, and conversational."],
  ["professional_tone", "Make the answer sound professional and polished."],
  ["child_mode", "Explain using simple language and intuitive examples."],
  ["technical_explanation", "Explain with precise technical language."],
  ["short_answer", "Answer briefly while preserving the core meaning."],
];

const relations = [
  ["natural_language", "casual_tone", "USES", "Natural language uses conversational tone."],
  ["natural_language", "simplify", "USES", "Natural language simplifies wording."],
  ["natural_language", "add_example", "OFTEN_USES", "Natural language can use examples or analogies."],
  ["professional_tone", "technical_tone", "USES", "Professional tone uses precise wording."],
  ["professional_tone", "clarity", "USES", "Professional tone should stay clear."],
  ["child_mode", "simplify", "USES", "Child mode simplifies concepts."],
  ["child_mode", "add_example", "USES", "Child mode uses examples."],
  ["technical_explanation", "technical_tone", "USES", "Technical explanation uses precise terms."],
  ["short_answer", "summarize", "USES", "Short answers summarize."],
  ["short_answer", "preserve_core_meaning", "REQUIRES", "Short answers must preserve the core meaning."],
];

function getOrCreateStrategy(name: string, description: string): string {
  const existing = db.prepare(`
    SELECT id FROM language_strategies
    WHERE lower(name) = lower(?)
    LIMIT 1
  `).get(name) as { id: string } | undefined;

  if (existing) return existing.id;

  const id = crypto.randomUUID();

  db.prepare(`
    INSERT INTO language_strategies (
      id, name, description, confidence_score, usage_count, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, description, 0.4, 0, now, now);

  console.log("Seeded strategy:", name);
  return id;
}

function getSkillId(name: string): string | null {
  const row = db.prepare(`
    SELECT id FROM language_skills
    WHERE lower(name) = lower(?)
    LIMIT 1
  `).get(name) as { id: string } | undefined;

  return row?.id ?? null;
}

for (const [name, description] of strategies) {
  getOrCreateStrategy(name, description);
}

let inserted = 0;
let skipped = 0;

for (const [strategyName, skillName, relationType, description] of relations) {
  const strategyId = getOrCreateStrategy(strategyName, "");
  const skillId = getSkillId(skillName);

  if (!skillId) {
    skipped++;
    continue;
  }

  const existing = db.prepare(`
    SELECT id FROM language_strategy_relations
    WHERE strategy_id = ?
      AND skill_id = ?
      AND relation_type = ?
    LIMIT 1
  `).get(strategyId, skillId, relationType) as { id: string } | undefined;

  if (existing) {
    skipped++;
    continue;
  }

  db.prepare(`
    INSERT INTO language_strategy_relations (
      id, strategy_id, skill_id, relation_type,
      description, confidence_score, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    strategyId,
    skillId,
    relationType,
    description,
    0.45,
    now,
    now
  );

  inserted++;
}

console.log("Language strategy seed completed.");
console.log({ inserted, skipped });

import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

const relations = [
  ["professional_tone", "USES", "technical_tone", "Professional tone uses more precise and formal wording."],
  ["professional_tone", "USES", "clarity", "Professional tone should be clear and direct."],
  ["natural_language", "USES", "casual_tone", "Natural language often uses conversational tone."],
  ["natural_language", "USES", "simplify", "Natural language often simplifies wording."],
];

function getSkillId(name: string): string | null {
  const row = db.prepare(`
    SELECT id FROM language_skills
    WHERE lower(name) = lower(?)
    LIMIT 1
  `).get(name) as { id: string } | undefined;

  return row?.id ?? null;
}

let inserted = 0;
let skipped = 0;

for (const [from, relationType, to, description] of relations) {
  const fromId = getSkillId(from);
  const toId = getSkillId(to);

  if (!fromId || !toId) {
    skipped++;
    continue;
  }

  const existing = db.prepare(`
    SELECT id FROM language_skill_relations
    WHERE from_skill_id = ?
      AND to_skill_id = ?
      AND relation_type = ?
    LIMIT 1
  `).get(fromId, toId, relationType) as { id: string } | undefined;

  if (existing) {
    skipped++;
    continue;
  }

  db.prepare(`
    INSERT INTO language_skill_relations (
      id,
      from_skill_id,
      to_skill_id,
      relation_type,
      description,
      confidence_score,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    fromId,
    toId,
    relationType,
    description,
    0.45,
    now,
    now
  );

  inserted++;
}

console.log("Strengthened language skills.");
console.log({ inserted, skipped });

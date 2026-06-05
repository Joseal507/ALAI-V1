import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");

const now = new Date().toISOString();

const skills = [
  ["remove_redundant_detail", "OPERATION", "Remove repeated or unnecessary information."],
  ["reduce_sentence_length", "OPERATION", "Make sentences shorter."],
  ["preserve_core_meaning", "CONSTRAINT", "Keep the original meaning intact."],
  ["replace_complex_words", "OPERATION", "Replace difficult words with easier ones."],
  ["add_example", "OPERATION", "Add an example to clarify meaning."],
  ["use_precise_terms", "OPERATION", "Use accurate technical vocabulary."],
];

const relations = [
  ["summarize", "USES", "remove_redundant_detail", "Summarizing removes unnecessary detail."],
  ["summarize", "USES", "reduce_sentence_length", "Summarizing usually shortens sentences."],
  ["summarize", "REQUIRES", "preserve_core_meaning", "Summarizing must preserve meaning."],
  ["simplify", "USES", "replace_complex_words", "Simplifying uses easier words."],
  ["expand", "USES", "add_example", "Expanding can add examples."],
  ["technical_tone", "USES", "use_precise_terms", "Technical tone uses precise terms."],
];

function getOrCreateSkill(name: string, type: string, description: string): string {
  const existing = db.prepare(`
    SELECT id FROM language_skills WHERE lower(name) = lower(?) LIMIT 1
  `).get(name) as { id: string } | undefined;

  if (existing) return existing.id;

  const id = crypto.randomUUID();

  db.prepare(`
    INSERT INTO language_skills (
      id, name, skill_type, description,
      confidence_score, usage_count, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, type, description, 0.4, 0, now, now);

  console.log("Seeded:", name);
  return id;
}

for (const [name, type, description] of skills) {
  getOrCreateSkill(name, type, description);
}

let inserted = 0;
let skipped = 0;

for (const [from, relationType, to, description] of relations) {
  const fromSkill = db.prepare(`SELECT id FROM language_skills WHERE name = ?`).get(from) as { id: string } | undefined;
  const toSkill = db.prepare(`SELECT id FROM language_skills WHERE name = ?`).get(to) as { id: string } | undefined;

  if (!fromSkill || !toSkill) {
    skipped++;
    continue;
  }

  const existing = db.prepare(`
    SELECT id FROM language_skill_relations
    WHERE from_skill_id = ? AND to_skill_id = ? AND relation_type = ?
    LIMIT 1
  `).get(fromSkill.id, toSkill.id, relationType) as { id: string } | undefined;

  if (existing) {
    skipped++;
    continue;
  }

  db.prepare(`
    INSERT INTO language_skill_relations (
      id, from_skill_id, to_skill_id, relation_type,
      description, confidence_score, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    fromSkill.id,
    toSkill.id,
    relationType,
    description,
    0.45,
    now,
    now
  );

  inserted++;
}

console.log("Language ontology seed completed.");
console.log({ inserted, skipped });

import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");

type SkillSeed = {
  name: string;
  skillType: string;
  description: string;
};

type RelationSeed = {
  from: string;
  to: string;
  relationType: string;
  description: string;
};

const skills: SkillSeed[] = [
  {
    name: "summarize",
    skillType: "TRANSFORMATION",
    description: "Compress an answer while preserving the main idea.",
  },
  {
    name: "expand",
    skillType: "TRANSFORMATION",
    description: "Add useful detail, examples, and explanation depth.",
  },
  {
    name: "paraphrase",
    skillType: "TRANSFORMATION",
    description: "Rewrite meaning using different wording without changing the idea.",
  },
  {
    name: "simplify",
    skillType: "TRANSFORMATION",
    description: "Reduce complexity and use easier language.",
  },
  {
    name: "casual_tone",
    skillType: "STYLE",
    description: "Use natural conversational wording.",
  },
  {
    name: "technical_tone",
    skillType: "STYLE",
    description: "Use precise academic or domain-specific terms.",
  },
  {
    name: "user_voice",
    skillType: "STYLE",
    description: "Adapt wording to sound closer to the user's own style.",
  },
  {
    name: "preserve_main_idea",
    skillType: "CONSTRAINT",
    description: "Keep the central meaning unchanged during transformation.",
  },
  {
    name: "choose_relevant_detail",
    skillType: "CONTROL",
    description: "Select only details useful for the user's requested depth.",
  },
];

const relations: RelationSeed[] = [
  {
    from: "summarize",
    to: "preserve_main_idea",
    relationType: "REQUIRES",
    description: "Summarizing requires preserving the main idea.",
  },
  {
    from: "paraphrase",
    to: "preserve_main_idea",
    relationType: "REQUIRES",
    description: "Paraphrasing requires preserving the same meaning.",
  },
  {
    from: "expand",
    to: "choose_relevant_detail",
    relationType: "REQUIRES",
    description: "Expanding requires choosing relevant supporting details.",
  },
  {
    from: "simplify",
    to: "choose_relevant_detail",
    relationType: "USES",
    description: "Simplifying uses only the most necessary details.",
  },
  {
    from: "casual_tone",
    to: "simplify",
    relationType: "OFTEN_USES",
    description: "Casual tone often uses simpler wording.",
  },
  {
    from: "technical_tone",
    to: "choose_relevant_detail",
    relationType: "USES",
    description: "Technical tone uses precise details relevant to the domain.",
  },
  {
    from: "user_voice",
    to: "paraphrase",
    relationType: "USES",
    description: "Matching user voice uses paraphrasing into the user's style.",
  },
];

const now = new Date().toISOString();

function getOrCreateSkill(seed: SkillSeed): string {
  const existing = db.prepare(`
    SELECT id FROM language_skills
    WHERE lower(name) = lower(?)
    LIMIT 1
  `).get(seed.name) as { id: string } | undefined;

  if (existing) return existing.id;

  const id = crypto.randomUUID();

  db.prepare(`
    INSERT INTO language_skills (
      id,
      name,
      skill_type,
      description,
      confidence_score,
      usage_count,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    seed.name,
    seed.skillType,
    seed.description,
    0.4,
    0,
    now,
    now
  );

  console.log("Seeded language skill:", seed.name);
  return id;
}

const skillIds = new Map<string, string>();

for (const skill of skills) {
  skillIds.set(skill.name, getOrCreateSkill(skill));
}

let insertedRelations = 0;
let skippedRelations = 0;

for (const relation of relations) {
  const fromId = skillIds.get(relation.from);
  const toId = skillIds.get(relation.to);

  if (!fromId || !toId) {
    skippedRelations++;
    continue;
  }

  const existing = db.prepare(`
    SELECT id FROM language_skill_relations
    WHERE from_skill_id = ?
      AND to_skill_id = ?
      AND relation_type = ?
    LIMIT 1
  `).get(fromId, toId, relation.relationType) as { id: string } | undefined;

  if (existing) {
    skippedRelations++;
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
    relation.relationType,
    relation.description,
    0.45,
    now,
    now
  );

  insertedRelations++;
}

console.log("Language skill seed completed.");
console.log({ skills: skills.length, insertedRelations, skippedRelations });

import Database from "better-sqlite3";
import crypto from "node:crypto";

type SkillSeed = {
  name: string;
  skillType: string;
  description: string;
};

type SkillRelationSeed = {
  from: string;
  to: string;
  relationType: string;
  description: string;
};

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function inferSkillName(feedback: string): string {
  const text = normalize(feedback);

  if (/(profesional|professional)/.test(text)) return "professional_tone";
  if (/(académic|academic|universitario)/.test(text)) return "academic_tone";
  if (/(amigable|friendly)/.test(text)) return "friendly_tone";
  if (/(persuasiv|convincente)/.test(text)) return "persuasive_tone";
  if (/(directo|direct)/.test(text)) return "direct_style";
  if (/(natural|humano|human)/.test(text)) return "natural_language";
  if (/(claro|clear)/.test(text)) return "clarity";
  if (/(más corto|shorter|resum)/.test(text)) return "summarize";
  if (/(más largo|expand|detall)/.test(text)) return "expand";
  if (/(parafrase|rewrite)/.test(text)) return "paraphrase";

  return "general_language_adaptation";
}

function inferSkillType(skillName: string): string {
  if (skillName.includes("tone")) return "STYLE";
  if (skillName.includes("style")) return "STYLE";
  if (skillName === "summarize" || skillName === "expand" || skillName === "paraphrase") {
    return "TRANSFORMATION";
  }

  return "ADAPTATION";
}

function describeSkill(skillName: string, feedback: string): string {
  return `Language skill inferred from repeated user feedback: ${skillName}. Original feedback: ${feedback}`;
}

function baseSkillSeed(name: string, fallbackFeedback: string): SkillSeed {
  const known: Record<string, SkillSeed> = {
    summarize: {
      name: "summarize",
      skillType: "TRANSFORMATION",
      description: "Compress an answer while preserving the main idea.",
    },
    expand: {
      name: "expand",
      skillType: "TRANSFORMATION",
      description: "Add useful detail, examples, and explanation depth.",
    },
    paraphrase: {
      name: "paraphrase",
      skillType: "TRANSFORMATION",
      description: "Rewrite meaning using different wording without changing the idea.",
    },
    simplify: {
      name: "simplify",
      skillType: "TRANSFORMATION",
      description: "Reduce complexity and use easier language.",
    },
    casual_tone: {
      name: "casual_tone",
      skillType: "STYLE",
      description: "Use natural conversational wording.",
    },
    technical_tone: {
      name: "technical_tone",
      skillType: "STYLE",
      description: "Use precise academic or domain-specific terms.",
    },
    clarity: {
      name: "clarity",
      skillType: "STYLE",
      description: "Make the answer clear, direct, and easy to follow.",
    },
    add_example: {
      name: "add_example",
      skillType: "OPERATION",
      description: "Add an example or analogy when it helps understanding.",
    },
    preserve_main_idea: {
      name: "preserve_main_idea",
      skillType: "CONSTRAINT",
      description: "Keep the central meaning unchanged during transformation.",
    },
    preserve_core_meaning: {
      name: "preserve_core_meaning",
      skillType: "CONSTRAINT",
      description: "Keep the original meaning intact.",
    },
    natural_language: {
      name: "natural_language",
      skillType: "ADAPTATION",
      description: "Make the answer sound human, natural, and conversational.",
    },
    professional_tone: {
      name: "professional_tone",
      skillType: "STYLE",
      description: "Make the answer sound professional and polished.",
    },
  };

  return known[name] ?? {
    name,
    skillType: inferSkillType(name),
    description: describeSkill(name, fallbackFeedback),
  };
}

function inferredRelationsForSkill(skillName: string): SkillRelationSeed[] {
  const map: Record<string, SkillRelationSeed[]> = {
    natural_language: [
      {
        from: "natural_language",
        to: "casual_tone",
        relationType: "USES",
        description: "Natural language uses conversational tone.",
      },
      {
        from: "natural_language",
        to: "simplify",
        relationType: "USES",
        description: "Natural language simplifies wording.",
      },
      {
        from: "natural_language",
        to: "add_example",
        relationType: "OFTEN_USES",
        description: "Natural language can use examples or analogies.",
      },
    ],
    professional_tone: [
      {
        from: "professional_tone",
        to: "technical_tone",
        relationType: "USES",
        description: "Professional tone uses precise wording.",
      },
      {
        from: "professional_tone",
        to: "clarity",
        relationType: "USES",
        description: "Professional tone should stay clear.",
      },
    ],
    summarize: [
      {
        from: "summarize",
        to: "preserve_main_idea",
        relationType: "REQUIRES",
        description: "Summarizing requires preserving the main idea.",
      },
      {
        from: "summarize",
        to: "preserve_core_meaning",
        relationType: "REQUIRES",
        description: "Summarizing must preserve meaning.",
      },
    ],
    paraphrase: [
      {
        from: "paraphrase",
        to: "preserve_main_idea",
        relationType: "REQUIRES",
        description: "Paraphrasing requires preserving the same meaning.",
      },
    ],
    casual_tone: [
      {
        from: "casual_tone",
        to: "simplify",
        relationType: "OFTEN_USES",
        description: "Casual tone often uses simpler wording.",
      },
    ],
  };

  return map[skillName] ?? [];
}

function getOrCreateSkill(
  db: Database.Database,
  seed: SkillSeed,
  now: string
): string {
  const existing = db.prepare(`
    SELECT id, confidence_score AS confidenceScore
    FROM language_skills
    WHERE lower(name) = lower(?)
    LIMIT 1
  `).get(seed.name) as { id: string; confidenceScore: number } | undefined;

  if (existing) {
    db.prepare(`
      UPDATE language_skills
      SET confidence_score = ?,
          updated_at = ?
      WHERE id = ?
    `).run(Math.min(1, existing.confidenceScore + 0.02), now, existing.id);

    return existing.id;
  }

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
    0.35,
    0,
    now,
    now
  );

  return id;
}

function upsertSkillRelation(
  db: Database.Database,
  relation: SkillRelationSeed,
  now: string
): boolean {
  const fromId = getOrCreateSkill(db, baseSkillSeed(relation.from, relation.description), now);
  const toId = getOrCreateSkill(db, baseSkillSeed(relation.to, relation.description), now);

  const existing = db.prepare(`
    SELECT id, confidence_score AS confidenceScore
    FROM language_skill_relations
    WHERE from_skill_id = ?
      AND to_skill_id = ?
      AND relation_type = ?
    LIMIT 1
  `).get(fromId, toId, relation.relationType) as
    | { id: string; confidenceScore: number }
    | undefined;

  if (existing) {
    db.prepare(`
      UPDATE language_skill_relations
      SET confidence_score = ?,
          updated_at = ?
      WHERE id = ?
    `).run(Math.min(1, existing.confidenceScore + 0.03), now, existing.id);

    return false;
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

  return true;
}

export function improveLanguageFromFeedback(
  db: Database.Database,
  feedback: string
) {
  const now = new Date().toISOString();
  const skillName = inferSkillName(feedback);
  const skillSeed = baseSkillSeed(skillName, feedback);
  const description = describeSkill(skillName, feedback);

  const existing = db.prepare(`
    SELECT id, confidence_score AS confidenceScore, usage_count AS usageCount
    FROM language_skills
    WHERE lower(name) = lower(?)
    LIMIT 1
  `).get(skillName) as { id: string; confidenceScore: number; usageCount: number } | undefined;

  let created = false;
  let confidenceScore = 0.35;
  let usageCount = 1;

  if (existing) {
    confidenceScore = Math.min(1, existing.confidenceScore + 0.05);
    usageCount = existing.usageCount + 1;

    db.prepare(`
      UPDATE language_skills
      SET confidence_score = ?,
          usage_count = usage_count + 1,
          updated_at = ?
      WHERE id = ?
    `).run(confidenceScore, now, existing.id);
  } else {
    created = true;

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
      crypto.randomUUID(),
      skillName,
      skillSeed.skillType,
      description,
      confidenceScore,
      usageCount,
      now,
      now
    );
  }

  let insertedRelations = 0;
  let strengthenedRelations = 0;

  for (const relation of inferredRelationsForSkill(skillName)) {
    const inserted = upsertSkillRelation(db, relation, now);

    if (inserted) {
      insertedRelations++;
    } else {
      strengthenedRelations++;
    }
  }

  return {
    created,
    skillName,
    skillType: skillSeed.skillType,
    confidenceScore,
    usageCount,
    insertedRelations,
    strengthenedRelations,
  };
}

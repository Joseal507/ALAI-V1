import Database from "better-sqlite3";

export interface RetrievedLanguageSkill {
  name: string;
  skillType: string;
  description: string;
  confidenceScore: number;
}

export interface RetrievedLanguageSkillRelation {
  fromSkill: string;
  relationType: string;
  toSkill: string;
  description: string;
  confidenceScore: number;
}

export interface LanguageSkillContext {
  skills: RetrievedLanguageSkill[];
  relations: RetrievedLanguageSkillRelation[];
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function inferRelevantSkillNames(instruction: string): string[] {
  const text = normalize(instruction);
  const skills = new Set<string>();

  if (/(corto|breve|resum|short)/.test(text)) {
    skills.add("summarize");
  }

  if (/(más|detall|profund|expand|alarga)/.test(text)) {
    skills.add("expand");
  }

  if (/(parafrase|reescribe|diferente|rewrite)/.test(text)) {
    skills.add("paraphrase");
  }

  if (/(simple|facil|fácil|niño|entendible)/.test(text)) {
    skills.add("simplify");
  }

  if (/(casual|relajado|conmigo|normal|vaina)/.test(text)) {
    skills.add("casual_tone");
  }

  if (/(técnic|tecnic|formal|académic|academ)/.test(text)) {
    skills.add("technical_tone");
  }

  if (/(como yo|como si fuera yo|mi estilo|suena a mí)/.test(text)) {
    skills.add("user_voice");
  }

  return Array.from(skills);
}

export function retrieveLanguageSkillContext(
  db: Database.Database,
  instruction: string
): LanguageSkillContext {
  const skillNames = inferRelevantSkillNames(instruction);

  if (skillNames.length === 0) {
    return {
      skills: [],
      relations: [],
    };
  }

  const placeholders = skillNames.map(() => "?").join(",");

  const skills = db.prepare(`
    SELECT
      name,
      skill_type AS skillType,
      description,
      confidence_score AS confidenceScore
    FROM language_skills
    WHERE name IN (${placeholders})
    ORDER BY confidence_score DESC, usage_count DESC
  `).all(...skillNames) as RetrievedLanguageSkill[];

  const relationRows = db.prepare(`
    SELECT
      source.name AS fromSkill,
      relations.relation_type AS relationType,
      target.name AS toSkill,
      relations.description,
      relations.confidence_score AS confidenceScore
    FROM language_skill_relations relations
    JOIN language_skills source ON source.id = relations.from_skill_id
    JOIN language_skills target ON target.id = relations.to_skill_id
    WHERE source.name IN (${placeholders})
       OR target.name IN (${placeholders})
    ORDER BY relations.confidence_score DESC
    LIMIT 12
  `).all(...skillNames, ...skillNames) as RetrievedLanguageSkillRelation[];

  return {
    skills,
    relations: relationRows,
  };
}

export function buildLanguageSkillContextText(context: LanguageSkillContext): string {
  const parts: string[] = [];

  if (context.skills.length > 0) {
    parts.push("RELEVANT LANGUAGE SKILLS:");

    for (const skill of context.skills) {
      parts.push(
        `- ${skill.name} (${skill.skillType}): ${skill.description} ` +
        `(confidence=${skill.confidenceScore})`
      );
    }
  }

  if (context.relations.length > 0) {
    parts.push("\nLANGUAGE SKILL RELATIONS:");

    for (const relation of context.relations) {
      parts.push(
        `- ${relation.fromSkill} ${relation.relationType} ${relation.toSkill}: ` +
        `${relation.description} (confidence=${relation.confidenceScore})`
      );
    }
  }

  return parts.length > 0
    ? parts.join("\n")
    : "No relevant language skills found.";
}

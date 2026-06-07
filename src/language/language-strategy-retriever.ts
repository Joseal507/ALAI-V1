import Database from "better-sqlite3";
import type { LanguageSkillContext, RetrievedLanguageSkill, RetrievedLanguageSkillRelation } from "./language-skill-retriever";

export interface RetrievedLanguageStrategy {
  name: string;
  description: string;
  confidenceScore: number;
}

export interface LanguageStrategyContext {
  strategies: RetrievedLanguageStrategy[];
  expandedSkills: RetrievedLanguageSkill[];
  expandedSkillRelations: RetrievedLanguageSkillRelation[];
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function inferStrategyNames(instruction: string): string[] {
  const text = normalize(instruction);
  const strategies = new Set<string>();

  if (/(humano|natural|human|suene natural)/.test(text)) {
    strategies.add("natural_language");
  }

  if (/(profesional|professional|pulido|polished)/.test(text)) {
    strategies.add("professional_tone");
  }

  if (/(niño|kid|child|básico|basico)/.test(text)) {
    strategies.add("child_mode");
  }

  if (/(técnic|tecnic|technical|académic|academ)/.test(text)) {
    strategies.add("technical_explanation");
  }

  if (/(corto|breve|short|resum)/.test(text)) {
    strategies.add("short_answer");
  }

  return Array.from(strategies);
}

export function retrieveLanguageStrategyContext(
  db: Database.Database,
  instruction: string
): LanguageStrategyContext {
  const strategyNames = inferStrategyNames(instruction);

  if (strategyNames.length === 0) {
    return {
      strategies: [],
      expandedSkills: [],
      expandedSkillRelations: [],
    };
  }

  const placeholders = strategyNames.map(() => "?").join(",");

  const strategies = db.prepare(`
    SELECT
      name,
      description,
      confidence_score AS confidenceScore
    FROM language_strategies
    WHERE name IN (${placeholders})
    ORDER BY confidence_score DESC, usage_count DESC
  `).all(...strategyNames) as RetrievedLanguageStrategy[];

  const expandedSkills = db.prepare(`
    SELECT DISTINCT
      skills.name,
      skills.skill_type AS skillType,
      skills.description,
      skills.confidence_score AS confidenceScore
    FROM language_strategy_relations strategy_relations
    JOIN language_strategies strategies ON strategies.id = strategy_relations.strategy_id
    JOIN language_skills skills ON skills.id = strategy_relations.skill_id
    WHERE strategies.name IN (${placeholders})
    ORDER BY skills.confidence_score DESC, skills.usage_count DESC
  `).all(...strategyNames) as RetrievedLanguageSkill[];

  const skillNames = expandedSkills.map((skill) => skill.name);

  let expandedSkillRelations: RetrievedLanguageSkillRelation[] = [];

  if (skillNames.length > 0) {
    const skillPlaceholders = skillNames.map(() => "?").join(",");

    expandedSkillRelations = db.prepare(`
      SELECT
        source.name AS fromSkill,
        relations.relation_type AS relationType,
        target.name AS toSkill,
        relations.description,
        relations.confidence_score AS confidenceScore
      FROM language_skill_relations relations
      JOIN language_skills source ON source.id = relations.from_skill_id
      JOIN language_skills target ON target.id = relations.to_skill_id
      WHERE source.name IN (${skillPlaceholders})
         OR target.name IN (${skillPlaceholders})
      ORDER BY relations.confidence_score DESC
      LIMIT 20
    `).all(...skillNames, ...skillNames) as RetrievedLanguageSkillRelation[];
  }

  return {
    strategies,
    expandedSkills,
    expandedSkillRelations,
  };
}

export function mergeStrategyIntoSkillContext(
  skillContext: LanguageSkillContext,
  strategyContext: LanguageStrategyContext
): LanguageSkillContext {
  const skillMap = new Map<string, RetrievedLanguageSkill>();
  const relationMap = new Map<string, RetrievedLanguageSkillRelation>();

  for (const skill of skillContext.skills) {
    skillMap.set(skill.name, skill);
  }

  for (const skill of strategyContext.expandedSkills) {
    skillMap.set(skill.name, skill);
  }

  for (const relation of skillContext.relations) {
    relationMap.set(
      `${relation.fromSkill}:${relation.relationType}:${relation.toSkill}`,
      relation
    );
  }

  for (const relation of strategyContext.expandedSkillRelations) {
    relationMap.set(
      `${relation.fromSkill}:${relation.relationType}:${relation.toSkill}`,
      relation
    );
  }

  return {
    skills: Array.from(skillMap.values()),
    relations: Array.from(relationMap.values()),
  };
}

export function buildLanguageStrategyContextText(context: LanguageStrategyContext): string {
  const parts: string[] = [];

  if (context.strategies.length > 0) {
    parts.push("RELEVANT LANGUAGE STRATEGIES:");

    for (const strategy of context.strategies) {
      parts.push(
        `- ${strategy.name}: ${strategy.description} ` +
        `(confidence=${strategy.confidenceScore})`
      );
    }
  }

  if (context.expandedSkills.length > 0) {
    parts.push("\nSTRATEGY EXPANDED SKILLS:");

    for (const skill of context.expandedSkills) {
      parts.push(
        `- ${skill.name} (${skill.skillType}): ${skill.description} ` +
        `(confidence=${skill.confidenceScore})`
      );
    }
  }

  return parts.length > 0 ? parts.join("\n") : "No relevant language strategies found.";
}

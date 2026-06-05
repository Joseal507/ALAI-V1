import Database from "better-sqlite3";
import crypto from "node:crypto";

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

export function improveLanguageFromFeedback(
  db: Database.Database,
  feedback: string
) {
  const now = new Date().toISOString();
  const skillName = inferSkillName(feedback);
  const skillType = inferSkillType(skillName);
  const description = describeSkill(skillName, feedback);

  const existing = db.prepare(`
    SELECT id, confidence_score AS confidenceScore, usage_count AS usageCount
    FROM language_skills
    WHERE lower(name) = lower(?)
    LIMIT 1
  `).get(skillName) as { id: string; confidenceScore: number; usageCount: number } | undefined;

  if (existing) {
    const nextConfidence = Math.min(1, existing.confidenceScore + 0.05);

    db.prepare(`
      UPDATE language_skills
      SET confidence_score = ?,
          usage_count = usage_count + 1,
          updated_at = ?
      WHERE id = ?
    `).run(nextConfidence, now, existing.id);

    return {
      created: false,
      skillName,
      skillType,
      confidenceScore: nextConfidence,
      usageCount: existing.usageCount + 1,
    };
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
    skillName,
    skillType,
    description,
    0.35,
    1,
    now,
    now
  );

  return {
    created: true,
    skillName,
    skillType,
    confidenceScore: 0.35,
    usageCount: 1,
  };
}

import Database from "better-sqlite3";
import crypto from "node:crypto";

export interface LearnedLanguagePattern {
  id: string;
  patternType: string;
  instruction: string;
  inputExample: string;
  outputExample: string;
  styleSummary: string;
  confidenceScore: number;
  usageCount: number;
}

export interface LanguageFeedbackInput {
  userInstruction: string;
  previousResponse?: string;
  improvedResponse?: string;
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function inferPatternType(instruction: string): string {
  const normalized = normalize(instruction);

  const signals: Array<[string, string[]]> = [
    ["LENGTH_CONTROL", ["corto", "resum", "menos largo", "breve", "short"]],
    ["PARAPHRASE", ["parafrasea", "dilo diferente", "reescribe", "rewrite"]],
    ["TONE_SHIFT", ["casual", "formal", "serio", "relajado", "tono"]],
    ["PERSONA_MATCH", ["como si fuera yo", "como yo", "mi estilo", "suena a mí"]],
    ["SIMPLIFY", ["simple", "niño", "facil", "fácil", "sin tecnicismo"]],
    ["EXPAND", ["más completo", "explica más", "detallado", "profundo"]],
  ];

  for (const [type, words] of signals) {
    if (words.some((word) => normalized.includes(word))) {
      return type;
    }
  }

  return "GENERAL_STYLE";
}

function summarizeStyle(instruction: string): string {
  const normalized = normalize(instruction);
  const traits: string[] = [];

  if (/(corto|breve|resum|short)/.test(normalized)) {
    traits.push("prefer shorter wording");
  }

  if (/(casual|relajado|normal|vaina)/.test(normalized)) {
    traits.push("prefer casual conversational tone");
  }

  if (/(formal|serio|profesional)/.test(normalized)) {
    traits.push("prefer formal tone");
  }

  if (/(simple|facil|fácil|niño)/.test(normalized)) {
    traits.push("prefer simpler explanation");
  }

  if (/(parafrasea|reescribe|diferente|rewrite)/.test(normalized)) {
    traits.push("prefer rewording while preserving meaning");
  }

  if (/(como si fuera yo|como yo|mi estilo|suena a mí)/.test(normalized)) {
    traits.push("prefer matching the user's voice");
  }

  return traits.length > 0
    ? traits.join("; ")
    : `style instruction learned from user wording: ${instruction}`;
}

export function learnLanguagePattern(
  db: Database.Database,
  input: LanguageFeedbackInput
): LearnedLanguagePattern {
  const now = new Date().toISOString();
  const patternType = inferPatternType(input.userInstruction);
  const styleSummary = summarizeStyle(input.userInstruction);
  const normalizedInstruction = normalize(input.userInstruction);

  const existing = db.prepare(`
    SELECT
      id,
      pattern_type AS patternType,
      instruction,
      input_example AS inputExample,
      output_example AS outputExample,
      style_summary AS styleSummary,
      confidence_score AS confidenceScore,
      usage_count AS usageCount
    FROM language_patterns
    WHERE pattern_type = ?
      AND lower(instruction) = lower(?)
    LIMIT 1
  `).get(patternType, normalizedInstruction) as LearnedLanguagePattern | undefined;

  if (existing) {
    const nextConfidence = Math.min(1, existing.confidenceScore + 0.05);

    db.prepare(`
      UPDATE language_patterns
      SET confidence_score = ?,
          usage_count = usage_count + 1,
          input_example = CASE
            WHEN ? != '' THEN ?
            ELSE input_example
          END,
          output_example = CASE
            WHEN ? != '' THEN ?
            ELSE output_example
          END,
          updated_at = ?
      WHERE id = ?
    `).run(
      nextConfidence,
      input.previousResponse || "",
      input.previousResponse || "",
      input.improvedResponse || "",
      input.improvedResponse || "",
      now,
      existing.id
    );

    db.prepare(`
      INSERT INTO language_feedback (
        id,
        user_instruction,
        previous_response,
        improved_response,
        feedback_summary,
        learned_pattern_id,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      input.userInstruction,
      input.previousResponse || "",
      input.improvedResponse || "",
      styleSummary,
      existing.id,
      now
    );

    return {
      ...existing,
      confidenceScore: nextConfidence,
      usageCount: existing.usageCount + 1,
    };
  }

  const id = crypto.randomUUID();

  db.prepare(`
    INSERT INTO language_patterns (
      id,
      pattern_type,
      instruction,
      input_example,
      output_example,
      style_summary,
      confidence_score,
      usage_count,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    patternType,
    normalizedInstruction,
    input.previousResponse || "",
    input.improvedResponse || "",
    styleSummary,
    0.35,
    1,
    now,
    now
  );

  db.prepare(`
    INSERT INTO language_feedback (
      id,
      user_instruction,
      previous_response,
      improved_response,
      feedback_summary,
      learned_pattern_id,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    input.userInstruction,
    input.previousResponse || "",
    input.improvedResponse || "",
    styleSummary,
    id,
    now
  );

  return {
    id,
    patternType,
    instruction: normalizedInstruction,
    inputExample: input.previousResponse || "",
    outputExample: input.improvedResponse || "",
    styleSummary,
    confidenceScore: 0.35,
    usageCount: 1,
  };
}

export function retrieveLanguagePatterns(
  db: Database.Database,
  instruction: string,
  limit = 5
): LearnedLanguagePattern[] {
  const patternType = inferPatternType(instruction);
  const normalizedInstruction = normalize(instruction);

  return db.prepare(`
    SELECT
      id,
      pattern_type AS patternType,
      instruction,
      input_example AS inputExample,
      output_example AS outputExample,
      style_summary AS styleSummary,
      confidence_score AS confidenceScore,
      usage_count AS usageCount
    FROM language_patterns
    WHERE pattern_type = ?
       OR lower(?) LIKE '%' || lower(instruction) || '%'
       OR lower(style_summary) LIKE '%' || lower(?) || '%'
    ORDER BY confidence_score DESC, usage_count DESC, updated_at DESC
    LIMIT ?
  `).all(patternType, normalizedInstruction, normalizedInstruction, limit) as LearnedLanguagePattern[];
}

export function buildLanguagePatternContext(patterns: LearnedLanguagePattern[]): string {
  if (patterns.length === 0) {
    return "No learned language patterns found.";
  }

  return [
    "LEARNED LANGUAGE PATTERNS:",
    ...patterns.map((pattern) => {
      return (
        `- ${pattern.patternType}: ${pattern.styleSummary} ` +
        `(confidence=${pattern.confidenceScore}, uses=${pattern.usageCount})`
      );
    }),
  ].join("\n");
}

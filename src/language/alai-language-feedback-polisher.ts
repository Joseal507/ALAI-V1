import Database from "better-sqlite3";

function isSafePattern(pattern: string): boolean {
  const text = pattern.trim();

  if (!text) return false;

  // No reemplazar respuestas completas: eso contamina preguntas nuevas.
  if (text.length > 180) return false;
  if (text.includes("\n")) return false;
  if (text.includes("Internal confidence")) return false;
  if (text.includes("Confianza interna")) return false;
  if (text.includes("Reasoning from")) return false;
  if (text.includes("Razonamiento interno")) return false;

  return true;
}

export function applyAlaiLanguageFeedback(
  db: Database.Database,
  answer: string
): string {
  const table = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type='table'
      AND name='alai_language_feedback'
    LIMIT 1
  `).get();

  if (!table) return answer;

  const rows = db.prepare(`
    SELECT bad_pattern AS badPattern, correction
    FROM alai_language_feedback
    WHERE status='ACTIVE'
    ORDER BY created_at DESC
    LIMIT 100
  `).all() as { badPattern: string; correction: string }[];

  let output = answer;

  for (const row of rows) {
    if (!isSafePattern(row.badPattern)) continue;
    output = output.split(row.badPattern).join(row.correction);
  }

  return output;
}

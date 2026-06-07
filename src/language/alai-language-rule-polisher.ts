import Database from "better-sqlite3";

export function applyAlaiLanguageRules(
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

  if (!table) return answer.trim();

  const rows = db.prepare(`
    SELECT bad_pattern AS badPattern, correction
    FROM alai_language_feedback
    WHERE status='ACTIVE'
      AND length(bad_pattern) > 0
      AND length(correction) > 0
    ORDER BY created_at DESC
    LIMIT 100
  `).all() as { badPattern: string; correction: string }[];

  let output = answer;

  for (const row of rows) {
    output = output.split(row.badPattern).join(row.correction);
  }

  return output
    .replace(/\s+\./g, ".")
    .replace(/\.\./g, ".")
    .trim();
}

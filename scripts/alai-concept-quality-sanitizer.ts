import Database from "better-sqlite3";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

const ambiguous = [
  "big",
  "small",
  "different",
  "name",
  "term",
  "less",
  "more"
];

let flagged = 0;

for (const name of ambiguous) {
  const rows = db.prepare(`
    SELECT id, name, description
    FROM concepts
    WHERE lower(name) = ?
  `).all(name) as { id: string; name: string; description: string }[];

  for (const row of rows) {
    const text = row.description.toLowerCase();

    const contextualEnough =
      text.includes("math") ||
      text.includes("comparison") ||
      text.includes("language") ||
      text.includes("algebra") ||
      text.includes("quantity") ||
      text.includes("grammar");

    if (contextualEnough) continue;

    db.prepare(`
      INSERT INTO alai_quality_flags (
        id,
        target_type,
        target_id,
        issue_type,
        severity,
        message,
        status,
        created_at,
        updated_at
      )
      VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(target_type, target_id, issue_type) DO UPDATE SET
        severity = excluded.severity,
        message = excluded.message,
        status = excluded.status,
        updated_at = excluded.updated_at
    `).run(
      "CONCEPT",
      row.id,
      "AMBIGUOUS_CONCEPT",
      "HIGH",
      `Concept "${row.name}" is too ambiguous without curriculum context.`,
      "OPEN",
      now,
      now
    );

    db.prepare(`
      UPDATE concepts
      SET status = 'PENDING',
          updated_at = ?
      WHERE id = ?
    `).run(now, row.id);

    flagged++;
  }
}

console.log("ALAI concept quality sanitizer completed.");
console.log({ ambiguousConceptsFlagged: flagged });

console.table(db.prepare(`
  SELECT target_type, issue_type, severity, status, COUNT(*) AS count
  FROM alai_quality_flags
  GROUP BY target_type, issue_type, severity, status
  ORDER BY count DESC
`).all());

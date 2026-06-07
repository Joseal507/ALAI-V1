import Database from "better-sqlite3";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

const levels = Object.fromEntries(
  (db.prepare(`SELECT id, lower(name) AS name FROM education_levels`).all() as any[])
    .map((r) => [r.name, r.id])
);

const rules: [string, string[]][] = [
  ["preschool", [
    "baby", "infant", "early childhood", "colors", "shapes", "animals",
    "body parts", "family", "emotions", "objects", "patterns", "basic actions"
  ]],
  ["primary", [
    "primary", "reading", "writing", "words", "letters", "numbers",
    "counting", "basic arithmetic", "simple sentences", "food", "comparison"
  ]],
  ["premedia", [
    "geometry", "angle", "fractions", "equations", "basic science",
    "social skills", "grammar"
  ]],
  ["media", [
    "algebra", "linear algebra", "vector", "scalar", "function",
    "probability", "statistics"
  ]],
  ["undergraduate", [
    "group theory", "vector space", "basis", "dimension",
    "linear independence", "subgroup", "identity element", "inverse element"
  ]],
];

let updated = 0;

const topics = db.prepare(`
SELECT id, lower(name) AS name, lower(description) AS description
FROM curriculum_topics
WHERE education_level_id IS NULL
`).all() as { id: string; name: string; description: string }[];

for (const topic of topics) {
  const text = `${topic.name} ${topic.description}`;

  for (const [levelName, keywords] of rules) {
    const levelId = levels[levelName];
    if (!levelId) continue;

    if (keywords.some((kw) => text.includes(kw))) {
      const result = db.prepare(`
        UPDATE curriculum_topics
        SET education_level_id = ?,
            updated_at = ?
        WHERE id = ?
      `).run(levelId, now, topic.id);

      updated += result.changes;
      break;
    }
  }
}

console.log("Mapped curriculum topics to education levels.");
console.log({ updated });

console.table(db.prepare(`
SELECT
  e.name AS level,
  COUNT(t.id) AS topics
FROM education_levels e
LEFT JOIN curriculum_topics t ON t.education_level_id = e.id
GROUP BY e.id
ORDER BY e.order_index
`).all());

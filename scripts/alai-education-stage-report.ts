import Database from "better-sqlite3";

const db = new Database("data/alai.db");

console.log("=== ALAI Education Stage Report ===");

const rows = db.prepare(`
SELECT
  e.name AS level,
  e.order_index AS order_index,
  COUNT(DISTINCT t.id) AS total_topics,
  COUNT(DISTINCT tc.concept_id) AS linked_concepts,
  COUNT(DISTINCT CASE WHEN cm.mastery_level IN ('STRONG','MASTERED') THEN tc.concept_id END) AS strong_concepts,
  COUNT(DISTINCT CASE WHEN cm.mastery_level = 'MASTERED' THEN tc.concept_id END) AS mastered_concepts,
  ROUND(
    CASE
      WHEN COUNT(DISTINCT tc.concept_id) = 0 THEN 0
      ELSE 1.0 * COUNT(DISTINCT CASE WHEN cm.mastery_level IN ('STRONG','MASTERED') THEN tc.concept_id END)
        / COUNT(DISTINCT tc.concept_id)
    END, 3
  ) AS concept_completion,
  ROUND(
    CASE
      WHEN COUNT(DISTINCT tc.concept_id) = 0 THEN 0
      ELSE 1.0 * COUNT(DISTINCT CASE WHEN cm.mastery_level = 'MASTERED' THEN tc.concept_id END)
        / COUNT(DISTINCT tc.concept_id)
    END, 3
  ) AS mastery_completion
FROM education_levels e
LEFT JOIN curriculum_topics t ON t.education_level_id = e.id
LEFT JOIN topic_concepts tc ON tc.topic_id = t.id
LEFT JOIN concept_mastery cm ON cm.concept_id = tc.concept_id
GROUP BY e.id
ORDER BY e.order_index ASC
`).all() as any[];

console.table(rows);

let currentStage = "Not enough curriculum data yet";

for (const row of rows) {
  if (row.total_topics === 0 && row.linked_concepts === 0) continue;

  const score = Number(row.concept_completion || 0);

  if (score >= 0.75) {
    currentStage = `${row.level} strong/completed`;
    continue;
  }

  if (score >= 0.4) {
    currentStage = `Currently inside ${row.level}`;
    break;
  }

  currentStage = `Before/entering ${row.level}`;
  break;
}

console.log("\nCurrent effective stage:");
console.log(currentStage);

console.log("\nInterpretation:");
console.log("- concept_completion = concepts STRONG or MASTERED inside that level");
console.log("- mastery_completion = concepts fully MASTERED inside that level");
console.log("- If total_topics > 0 but linked_concepts = 0, the curriculum exists but is not connected to concepts yet.");

console.log("\n=== Unlinked topics by level ===");
console.table(db.prepare(`
SELECT
  e.name AS level,
  COUNT(t.id) AS unlinked_topics
FROM education_levels e
JOIN curriculum_topics t ON t.education_level_id = e.id
LEFT JOIN topic_concepts tc ON tc.topic_id = t.id
WHERE tc.concept_id IS NULL
GROUP BY e.id
ORDER BY e.order_index
`).all());

console.log("\n=== Topics by level ===");
console.table(db.prepare(`
SELECT
  e.name AS level,
  t.name AS topic,
  t.status,
  t.confidence_score
FROM curriculum_topics t
JOIN education_levels e ON e.id = t.education_level_id
ORDER BY e.order_index, t.name
`).all());

console.log("\n=== Global Knowledge Snapshot ===");
console.table({
  concepts: (db.prepare("SELECT COUNT(*) AS n FROM concepts").get() as any).n,
  pending: (db.prepare("SELECT COUNT(*) AS n FROM concepts WHERE status='PENDING'").get() as any).n,
  verified: (db.prepare("SELECT COUNT(*) AS n FROM concepts WHERE status='VERIFIED'").get() as any).n,
  canonical: (db.prepare("SELECT COUNT(*) AS n FROM concepts WHERE status='CANONICAL'").get() as any).n,
  evidence: (db.prepare("SELECT COUNT(*) AS n FROM evidence").get() as any).n,
  relations: (db.prepare("SELECT COUNT(*) AS n FROM relations").get() as any).n,
});

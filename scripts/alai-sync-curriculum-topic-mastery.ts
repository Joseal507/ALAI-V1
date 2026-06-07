import Database from "better-sqlite3";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

const topics = db.prepare(`
SELECT id, name
FROM curriculum_topics
`).all() as { id: string; name: string }[];

let updated = 0;

for (const topic of topics) {
  const stats = db.prepare(`
    SELECT
      COUNT(DISTINCT tc.concept_id) AS total,
      COUNT(DISTINCT CASE WHEN cm.mastery_level IN ('STRONG','MASTERED') THEN tc.concept_id END) AS strong,
      COUNT(DISTINCT CASE WHEN cm.mastery_level = 'MASTERED' THEN tc.concept_id END) AS mastered
    FROM topic_concepts tc
    LEFT JOIN concept_mastery cm ON cm.concept_id = tc.concept_id
    WHERE tc.topic_id = ?
  `).get(topic.id) as {
    total: number;
    strong: number;
    mastered: number;
  };

  if (!stats.total || stats.total === 0) continue;

  const strongRatio = stats.strong / stats.total;
  const masteredRatio = stats.mastered / stats.total;

  let status = "PENDING";
  let confidence = 0.35;

  if (masteredRatio >= 0.65 || strongRatio >= 0.85) {
    status = "MASTERED";
    confidence = 0.88;
  } else if (strongRatio >= 0.6) {
    status = "VERIFIED";
    confidence = 0.7;
  } else if (strongRatio >= 0.35) {
    status = "LEARNING";
    confidence = 0.55;
  }

  const result = db.prepare(`
    UPDATE curriculum_topics
    SET status = ?,
        confidence_score = ?,
        updated_at = ?
    WHERE id = ?
  `).run(status, confidence, now, topic.id);

  updated += result.changes;
}

console.log("Curriculum topic mastery synced.");
console.log({ updated });

console.table(db.prepare(`
SELECT
  e.name AS level,
  t.status,
  COUNT(*) AS topics
FROM curriculum_topics t
LEFT JOIN education_levels e ON e.id = t.education_level_id
GROUP BY e.name, t.status
ORDER BY e.name, t.status
`).all());

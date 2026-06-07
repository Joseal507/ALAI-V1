import Database from "better-sqlite3";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS curriculum_coverage (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL,
  concepts_total INTEGER NOT NULL DEFAULT 0,
  concepts_mastered INTEGER NOT NULL DEFAULT 0,
  average_mastery REAL NOT NULL DEFAULT 0,
  coverage_score REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(topic_id),
  FOREIGN KEY (topic_id) REFERENCES curriculum_topics(id)
);
`);

const topics = db.prepare(`
  SELECT id
  FROM curriculum_topics
`).all() as { id: string }[];

const upsertCoverage = db.prepare(`
  INSERT INTO curriculum_coverage (
    id,
    topic_id,
    concepts_total,
    concepts_mastered,
    average_mastery,
    coverage_score,
    created_at,
    updated_at
  ) VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(topic_id) DO UPDATE SET
    concepts_total = excluded.concepts_total,
    concepts_mastered = excluded.concepts_mastered,
    average_mastery = excluded.average_mastery,
    coverage_score = excluded.coverage_score,
    updated_at = excluded.updated_at
`);

let updated = 0;

for (const topic of topics) {
  const stats = db.prepare(`
    SELECT
      COUNT(DISTINCT c.id) AS total,
      SUM(
        CASE
          WHEN c.status = 'VERIFIED'
           AND COALESCE(cm.mastery_score, 0) >= 0.82
           AND NOT EXISTS (
            SELECT 1
            FROM alai_quality_flags q
            WHERE q.target_type = 'CONCEPT'
              AND q.target_id = c.id
              AND q.status = 'OPEN'
           )
           AND NOT EXISTS (
            SELECT 1
            FROM concept_stage_flags sf
            WHERE sf.concept_id = c.id
              AND sf.status = 'FROZEN'
           )
          THEN 1
          ELSE 0
        END
      ) AS mastered,
      AVG(
        CASE
          WHEN c.status = 'VERIFIED'
           AND NOT EXISTS (
            SELECT 1
            FROM alai_quality_flags q
            WHERE q.target_type = 'CONCEPT'
              AND q.target_id = c.id
              AND q.status = 'OPEN'
           )
           AND NOT EXISTS (
            SELECT 1
            FROM concept_stage_flags sf
            WHERE sf.concept_id = c.id
              AND sf.status = 'FROZEN'
           )
          THEN COALESCE(cm.mastery_score, 0)
          ELSE 0
        END
      ) AS avgMastery
    FROM topic_concepts tc
    JOIN concepts c ON c.id = tc.concept_id
    LEFT JOIN concept_mastery cm ON cm.concept_id = c.id
    WHERE tc.topic_id = ?
  `).get(topic.id) as {
    total: number;
    mastered: number | null;
    avgMastery: number | null;
  };

  const total = stats.total ?? 0;
  const mastered = stats.mastered ?? 0;
  const avgMastery = stats.avgMastery ?? 0;
  const coverage = total === 0 ? 0 : mastered / total;

  upsertCoverage.run(
    topic.id,
    total,
    mastered,
    Number(avgMastery.toFixed(3)),
    Number(coverage.toFixed(3)),
    now,
    now
  );

  updated++;
}

console.log("Curriculum measurement layer updated.");
console.log({
  curriculumCoverage: updated,
  strictVerifiedOnly: true,
});

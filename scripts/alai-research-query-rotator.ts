import Database from "better-sqlite3";

const db = new Database("data/alai.db");

const rows = db.prepare(`
  SELECT
    o.id,
    o.title,
    o.attempts,
    t.name AS topicName
  FROM alai_learning_objectives o
  JOIN curriculum_topics t ON t.id = o.topic_id
  WHERE o.status IN ('OPEN', 'IN_PROGRESS')
  ORDER BY o.updated_at ASC
  LIMIT 25
`).all();

console.table(rows);

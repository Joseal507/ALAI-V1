import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

const weakDomains = db.prepare(`
  SELECT
    d.id AS domainId,
    d.name,
    cc.effective_coverage_score AS effective,
    cc.completion_score AS completion,
    cc.total_topics AS totalTopics
  FROM curriculum_completion cc
  JOIN academic_domains d ON d.id = cc.domain_id
  WHERE d.name != 'ALAI Metacognition'
    AND cc.total_topics > 0
    AND cc.effective_coverage_score < 0.45
  ORDER BY cc.effective_coverage_score ASC
  LIMIT 10
`).all() as {
  domainId: string;
  name: string;
  effective: number;
  completion: number;
  totalTopics: number;
}[];

const topics = db.prepare(`
  SELECT id, name
  FROM curriculum_topics
  WHERE domain_id = ?
  ORDER BY name ASC
  LIMIT 8
`);

const insertObjective = db.prepare(`
  INSERT OR IGNORE INTO alai_learning_objectives (
    id,
    topic_id,
    title,
    objective_type,
    status,
    priority_score,
    mastery_target,
    attempts,
    created_at,
    updated_at
  )
  VALUES (?, ?, ?, 'STRATEGIC_DOMAIN_LEARNING', 'OPEN', ?, 0.82, 0, ?, ?)
`);

const updatePriority = db.prepare(`
  UPDATE alai_learning_objectives
  SET priority_score = MAX(priority_score, ?),
      updated_at = ?
  WHERE topic_id = ?
    AND title = ?
    AND status = 'OPEN'
`);

let created = 0;
let updated = 0;

for (const domain of weakDomains) {
  const priority = Math.min(0.99, Math.max(0.72, 1 - domain.effective));

  const domainTopics = topics.all(domain.domainId) as { id: string; name: string }[];

  for (const topic of domainTopics) {
    const title = `Strategically master ${domain.name}: ${topic.name}`;

    const result = insertObjective.run(
      crypto.randomUUID(),
      topic.id,
      title,
      Number(priority.toFixed(3)),
      now,
      now
    );

    if (result.changes > 0) created++;
    else {
      updatePriority.run(Number(priority.toFixed(3)), now, topic.id, title);
      updated++;
    }
  }
}

db.prepare(`
  UPDATE alai_learning_objectives
  SET priority_score = CASE
    WHEN objective_type = 'META_COGNITION' THEN 0.95
    WHEN objective_type = 'STRATEGIC_DOMAIN_LEARNING' THEN MAX(priority_score, 0.82)
    WHEN objective_type = 'ACTIVE_DOMAIN_LEARNING' THEN MAX(priority_score, 0.72)
    ELSE priority_score
  END,
  updated_at = ?
  WHERE status = 'OPEN'
`).run(now);

console.log("ALAI domain objective seeder completed.");
console.log({ weakDomains: weakDomains.length, created, updated });

console.table(db.prepare(`
  SELECT
    o.title,
    o.objective_type AS type,
    o.status,
    o.priority_score AS priority
  FROM alai_learning_objectives o
  WHERE o.status = 'OPEN'
  ORDER BY o.priority_score DESC, o.updated_at DESC
  LIMIT 30
`).all());

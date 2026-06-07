import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

function getTopic(name: string): { id: string } | undefined {
  return db.prepare(`
    SELECT id FROM curriculum_topics
    WHERE lower(name) = lower(?)
    LIMIT 1
  `).get(name) as { id: string } | undefined;
}

function getDomain(name: string): { id: string } | undefined {
  return db.prepare(`
    SELECT id FROM academic_domains
    WHERE lower(name) = lower(?)
    LIMIT 1
  `).get(name) as { id: string } | undefined;
}

const algebra = getDomain("Algebra");

let parentTopic = getTopic("Linear Equations");

if (!parentTopic) {
  const id = crypto.randomUUID();

  db.prepare(`
    INSERT INTO curriculum_topics (
      id, education_level_id, domain_id, parent_topic_id, name, description,
      depth, status, confidence_score, expansion_status, created_at, updated_at
    ) VALUES (?, NULL, ?, NULL, 'Linear Equations', 'A core elementary algebra topic about equations of degree one.', 0, 'PENDING', 0.35, 'OPEN', ?, ?)
  `).run(id, algebra?.id ?? null, now, now);

  parentTopic = { id };
}

let fixed = 0;

for (const child of [
  "Slope-Intercept Form",
  "Standard Form",
  "Graphing Linear Equations",
  "Algebraic Manipulation",
  "Coordinate Geometry",
]) {
  const result = db.prepare(`
    UPDATE curriculum_topics
    SET parent_topic_id = ?,
        domain_id = COALESCE(domain_id, ?),
        depth = 1,
        updated_at = ?
    WHERE lower(name) = lower(?)
  `).run(parentTopic.id, algebra?.id ?? null, now, child);

  fixed += result.changes;
}

console.log("Fixed linear equation topic hierarchy.");
console.log({ fixed });

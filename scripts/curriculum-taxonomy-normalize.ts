import Database from "better-sqlite3";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

const algebra = db.prepare(`
  SELECT id
  FROM academic_domains
  WHERE name = 'Algebra'
  LIMIT 1
`).get() as { id: string } | undefined;

if (!algebra) {
  throw new Error('Cannot normalize taxonomy: Algebra domain not found.');
}

const targets = [
  'Abstract Algebra',
  'Elementary Algebra',
  'Linear Algebra',
];

const updateTopicDomain = db.prepare(`
  UPDATE curriculum_topics
  SET domain_id = ?, updated_at = ?
  WHERE name = ?
`);

const markResolved = db.prepare(`
  UPDATE curriculum_taxonomy_audit
  SET resolved_at = ?
  WHERE resolved_at IS NULL
    AND issue_type IN (
      'ALGEBRA_SPECIALIZATION_MISPLACED',
      'DOMAIN_TOPIC_NAME_COLLISION'
    )
    AND description LIKE ?
`);

let updated = 0;

for (const name of targets) {
  const result = updateTopicDomain.run(algebra.id, now, name);
  updated += result.changes;

  markResolved.run(now, `%Topic "${name}"%`);
}

console.log("Curriculum taxonomy normalization completed.");
console.log({
  movedTopicsToAlgebra: updated,
  normalizedTopics: targets,
});

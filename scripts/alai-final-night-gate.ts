import Database from "better-sqlite3";

const db = new Database("data/alai.db");

function count(sql: string): number {
  try {
    return (db.prepare(sql).get() as { count: number }).count;
  } catch {
    return 0;
  }
}

const openFlags = count(`
  SELECT COUNT(*) AS count
  FROM alai_quality_flags
  WHERE status = 'OPEN'
`);

const prereqs = count(`
  SELECT COUNT(*) AS count
  FROM concept_prerequisites
`);

const coreWeak = db.prepare(`
SELECT c.name, c.status, cm.mastery_level
FROM concepts c
LEFT JOIN concept_mastery cm ON cm.concept_id = c.id
WHERE lower(c.name) IN (
  'vector',
  'scalar',
  'linear combination',
  'vector space',
  'basis',
  'dimension',
  'linear independence',
  'span',
  'reading',
  'writing',
  'basic arithmetic'
)
AND (
  c.status = 'PENDING'
  OR cm.mastery_level IS NULL
  OR cm.mastery_level = 'WEAK'
)
`).all();

console.log("=== Final Night Gate ===");
console.table({
  openFlags,
  prereqs,
  weakCoreTargets: coreWeak.length,
});

if (coreWeak.length > 0) {
  console.log("\nWeak core targets:");
  console.table(coreWeak);
}

if (openFlags > 0) {
  console.error("BLOCKED: open quality flags remain.");
  process.exit(1);
}

if (prereqs < 10) {
  console.error("BLOCKED: prerequisite graph is too small.");
  process.exit(1);
}

console.log("PASS: ALAI is ready for controlled overnight goal learning.");

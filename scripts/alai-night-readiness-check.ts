import Database from "better-sqlite3";

const db = new Database("data/alai.db");

function tableExists(name: string) {
  return Boolean(db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name=?
  `).get(name));
}

function count(sql: string) {
  try {
    return (db.prepare(sql).get() as { count: number }).count;
  } catch {
    return 0;
  }
}

console.log("=== ALAI Night Readiness Check ===");

console.table({
  concepts: count("SELECT COUNT(*) AS count FROM concepts"),
  pending: count("SELECT COUNT(*) AS count FROM concepts WHERE status='PENDING'"),
  verified: count("SELECT COUNT(*) AS count FROM concepts WHERE status='VERIFIED'"),
  canonical: count("SELECT COUNT(*) AS count FROM concepts WHERE status='CANONICAL'"),
  rejected: count("SELECT COUNT(*) AS count FROM concepts WHERE status='REJECTED'"),
  evidence: count("SELECT COUNT(*) AS count FROM evidence"),
  relations: count("SELECT COUNT(*) AS count FROM relations"),
  prerequisites: tableExists("concept_prerequisites")
    ? count("SELECT COUNT(*) AS count FROM concept_prerequisites")
    : 0,
  open_knowledge_gaps: tableExists("knowledge_gaps")
    ? count("SELECT COUNT(*) AS count FROM knowledge_gaps WHERE status='OPEN'")
    : 0,
  open_discovered_gaps: tableExists("alai_discovered_gaps")
    ? count("SELECT COUNT(*) AS count FROM alai_discovered_gaps WHERE status='OPEN'")
    : 0,
  open_research_questions: count("SELECT COUNT(*) AS count FROM alai_research_questions WHERE status='OPEN'"),
  answered_research_questions: count("SELECT COUNT(*) AS count FROM alai_research_questions WHERE status='ANSWERED'"),
  rejected_research_questions: count("SELECT COUNT(*) AS count FROM alai_research_questions WHERE status='REJECTED'"),
  open_quality_flags: tableExists("alai_quality_flags")
    ? count("SELECT COUNT(*) AS count FROM alai_quality_flags WHERE status='OPEN'")
    : 0,
});

console.log("\n=== Open Quality Flags ===");
if (tableExists("alai_quality_flags")) {
  console.table(db.prepare(`
    SELECT target_type, issue_type, status, severity, substr(message,1,160) AS message
    FROM alai_quality_flags
    WHERE status='OPEN'
    ORDER BY updated_at DESC
    LIMIT 30
  `).all());
}

console.log("\n=== Core Night Targets ===");
console.table(db.prepare(`
SELECT
  c.name,
  c.status,
  c.confidence_score,
  cm.mastery_score,
  cm.mastery_level
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
  'basic arithmetic',
  'geometry',
  'angle measurement',
  'complementary angle'
)
ORDER BY c.name
`).all());

console.log("\n=== Suspicious Rejected/Pending Concepts ===");
console.table(db.prepare(`
SELECT name, status, confidence_score
FROM concepts
WHERE lower(name) LIKE '%sat-7%'
   OR lower(name) LIKE '%clinical trial%'
   OR lower(name) LIKE '%gold-money%'
   OR lower(name) LIKE '%tax resistance%'
   OR lower(name) LIKE '%homosexual%'
   OR lower(name) LIKE '%animal abuse%'
   OR lower(name) LIKE '%hunting%'
   OR lower(name) LIKE '%race%'
ORDER BY updated_at DESC
LIMIT 40
`).all());

console.log("\nDONE");

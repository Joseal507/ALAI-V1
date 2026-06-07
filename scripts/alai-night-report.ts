import Database from "better-sqlite3";

const db = new Database("data/alai.db");

function count(sql: string) {
  try {
    return (db.prepare(sql).get() as { count: number }).count;
  } catch {
    return 0;
  }
}

console.log("=== ALAI Night Report ===");

console.table({
  concepts: count("SELECT COUNT(*) AS count FROM concepts"),
  pending: count("SELECT COUNT(*) AS count FROM concepts WHERE status='PENDING'"),
  verified: count("SELECT COUNT(*) AS count FROM concepts WHERE status='VERIFIED'"),
  canonical: count("SELECT COUNT(*) AS count FROM concepts WHERE status='CANONICAL'"),
  rejected: count("SELECT COUNT(*) AS count FROM concepts WHERE status='REJECTED'"),
  evidence: count("SELECT COUNT(*) AS count FROM evidence"),
  relations: count("SELECT COUNT(*) AS count FROM relations"),
  open_questions: count("SELECT COUNT(*) AS count FROM alai_research_questions WHERE status='OPEN'"),
  answered_questions: count("SELECT COUNT(*) AS count FROM alai_research_questions WHERE status='ANSWERED'"),
  rejected_questions: count("SELECT COUNT(*) AS count FROM alai_research_questions WHERE status='REJECTED'"),
});

console.log("\n=== Recently Answered Research ===");
console.table(db.prepare(`
SELECT q.question_type, c.name AS concept, substr(q.question,1,80) AS question, q.status
FROM alai_research_questions q
LEFT JOIN concepts c ON c.id = q.concept_id
WHERE q.status IN ('ANSWERED','REJECTED')
ORDER BY q.updated_at DESC
LIMIT 30
`).all());

console.log("\n=== Recently Updated Concepts ===");
console.table(db.prepare(`
SELECT name, status, confidence_score
FROM concepts
ORDER BY updated_at DESC
LIMIT 40
`).all());

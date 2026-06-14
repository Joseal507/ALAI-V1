import Database from "better-sqlite3";

const db = new Database("data/alai.db");

function one(sql: string) {
  return db.prepare(sql).get() as any;
}

console.log("=== ALAI SCALE LEARNING METRICS ===");

console.table({
  concepts: one("SELECT COUNT(*) n FROM concepts").n,
  canonical: one("SELECT COUNT(*) n FROM concepts WHERE status='CANONICAL'").n,
  verified: one("SELECT COUNT(*) n FROM concepts WHERE status='VERIFIED'").n,
  pending: one("SELECT COUNT(*) n FROM concepts WHERE status='PENDING'").n,
  rejected: one("SELECT COUNT(*) n FROM concepts WHERE status='REJECTED'").n,
  evidence: one("SELECT COUNT(*) n FROM evidence").n,
  evidenceLinks: one("SELECT COUNT(*) n FROM concept_evidence_links").n,
  relations: one("SELECT COUNT(*) n FROM relations").n,
  researchOpen: one("SELECT COUNT(*) n FROM alai_research_questions WHERE status='OPEN'").n,
  researchAnswered: one("SELECT COUNT(*) n FROM alai_research_questions WHERE status='ANSWERED'").n,
  researchBlocked: one("SELECT COUNT(*) n FROM alai_research_questions WHERE status='BLOCKED'").n,
  gapsOpen: one("SELECT COUNT(*) n FROM knowledge_gaps WHERE status='OPEN'").n,
  gapsResolved: one("SELECT COUNT(*) n FROM knowledge_gaps WHERE status='RESOLVED'").n,
});

console.log("\\n=== RECENT RESEARCH QUESTIONS ===");
console.table(
  db.prepare(`
    SELECT status, question_type, question
    FROM alai_research_questions
    ORDER BY updated_at DESC
    LIMIT 12
  `).all()
);

console.log("\\n=== RECENT EVIDENCE ===");
console.table(
  db.prepare(`
    SELECT source_type, source_name, substr(content_summary,1,90) AS summary
    FROM evidence
    ORDER BY captured_at DESC
    LIMIT 8
  `).all()
);

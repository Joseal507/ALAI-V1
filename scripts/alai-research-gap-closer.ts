import Database from "better-sqlite3";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
  CREATE TABLE IF NOT EXISTS alai_research_gap_links (
    id TEXT PRIMARY KEY,
    gap_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(gap_id, question_id)
  );
`);

const resolvedByAnswered = db.prepare(`
  UPDATE knowledge_gaps
  SET status='RESOLVED',
      updated_at=?
  WHERE status='OPEN'
    AND id IN (
      SELECT gl.gap_id
      FROM alai_research_gap_links gl
      JOIN alai_research_questions q ON q.id = gl.question_id
      WHERE q.status = 'ANSWERED'
    )
`).run(now).changes;

const blockedByRepeatedBlocked = db.prepare(`
  UPDATE knowledge_gaps
  SET status='BLOCKED',
      updated_at=?
  WHERE status='OPEN'
    AND id IN (
      SELECT gl.gap_id
      FROM alai_research_gap_links gl
      JOIN alai_research_questions q ON q.id = gl.question_id
      GROUP BY gl.gap_id
      HAVING
        SUM(CASE WHEN q.status='BLOCKED' THEN 1 ELSE 0 END) >= 3
        AND SUM(CASE WHEN q.status IN ('OPEN','IN_PROGRESS') THEN 1 ELSE 0 END) = 0
    )
`).run(now).changes;

const resolvedByConceptStrength = db.prepare(`
  UPDATE knowledge_gaps
  SET status='RESOLVED',
      updated_at=?
  WHERE status='OPEN'
    AND concept_id IN (
      SELECT c.id
      FROM concepts c
      LEFT JOIN concept_mastery cm ON cm.concept_id = c.id
      LEFT JOIN concept_evidence_links cel ON cel.concept_id = c.id
      LEFT JOIN relations r ON r.from_concept_id = c.id OR r.to_concept_id = c.id
      WHERE c.status IN ('VERIFIED','CANONICAL')
      GROUP BY c.id
      HAVING
        COUNT(DISTINCT cel.evidence_id) >= 2
        AND COUNT(DISTINCT r.id) >= 2
        AND COALESCE(MAX(cm.mastery_score),0) >= 0.55
    )
`).run(now).changes;

console.log("ALAI research gap closer completed.");
console.log({
  resolvedByAnswered,
  blockedByRepeatedBlocked,
  resolvedByConceptStrength,
});

console.table(db.prepare(`
  SELECT status, COUNT(*) AS count
  FROM knowledge_gaps
  GROUP BY status
`).all());

db.close();

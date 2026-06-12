import Database from "better-sqlite3";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

const closeAlreadyVerified = db.prepare(`
  UPDATE alai_research_questions
  SET status = 'ANSWERED',
      updated_at = ?
  WHERE status = 'OPEN'
    AND concept_id IN (
      SELECT id
      FROM concepts
      WHERE status IN ('VERIFIED', 'CANONICAL')
    )
`);

const rejectLowValue = db.prepare(`
  UPDATE alai_research_questions
  SET status = 'REJECTED',
      updated_at = ?
  WHERE status = 'OPEN'
    AND concept_id IN (
      SELECT c.id
      FROM concepts c
      LEFT JOIN topic_concepts tc ON tc.concept_id = c.id
      LEFT JOIN relations r
        ON r.from_concept_id = c.id
        OR r.to_concept_id = c.id
      LEFT JOIN concept_evidence_links cel ON cel.concept_id = c.id
      WHERE c.status = 'PENDING'
      GROUP BY c.id
      HAVING
        c.confidence_score < 0.55
        AND COUNT(DISTINCT tc.topic_id) = 0
        AND COUNT(DISTINCT r.id) = 0
        AND COUNT(DISTINCT cel.evidence_id) = 0
    )
`);

const rejectDuplicates = db.prepare(`
  UPDATE alai_research_questions
  SET status = 'REJECTED',
      updated_at = ?
  WHERE status = 'OPEN'
    AND id NOT IN (
      SELECT MIN(id)
      FROM alai_research_questions
      WHERE status = 'OPEN'
      GROUP BY
        COALESCE(concept_id, topic_id, question),
        question_type
    )
`);

const a = closeAlreadyVerified.run(now).changes;
const b = rejectDuplicates.run(now).changes;
const c = rejectLowValue.run(now).changes;

console.log("ALAI research queue governor completed.");
console.log({
  closedAlreadyVerified: a,
  rejectedDuplicates: b,
  rejectedLowValue: c,
});

console.table(db.prepare(`
  SELECT status, COUNT(*) AS count
  FROM alai_research_questions
  GROUP BY status
`).all());

console.table(db.prepare(`
  SELECT
    COALESCE(c.name, t.name, 'Unknown') AS target,
    q.status,
    q.question_type,
    q.priority_score
  FROM alai_research_questions q
  LEFT JOIN concepts c ON c.id = q.concept_id
  LEFT JOIN curriculum_topics t ON t.id = q.topic_id
  WHERE q.status = 'OPEN'
  ORDER BY q.priority_score DESC, q.updated_at ASC
  LIMIT 40
`).all());

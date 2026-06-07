import Database from "better-sqlite3";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

const allocatedDomains = db.prepare(`
  SELECT area
  FROM alai_resource_allocations
  WHERE allocation_score >= 0.08
`).all() as { area: string }[];

const allowedAreas = allocatedDomains.map((row) => row.area.toLowerCase());

const rows = db.prepare(`
  SELECT
    q.id,
    q.concept_id AS conceptId,
    q.topic_id AS topicId,
    q.question_type AS questionType,
    q.priority_score AS priority,
    c.name AS conceptName,
    t.name AS topicName,
    d.name AS domainName,
    c.status AS conceptStatus,
    COALESCE((
      SELECT COUNT(*)
      FROM concept_evidence_links cel
      WHERE cel.concept_id = c.id
    ), 0) AS evidence,
    COALESCE((
      SELECT mastery_score
      FROM concept_mastery cm
      WHERE cm.concept_id = c.id
    ), 0) AS mastery
  FROM alai_research_questions q
  LEFT JOIN concepts c ON c.id = q.concept_id
  LEFT JOIN curriculum_topics t ON t.id = q.topic_id
  LEFT JOIN topic_concepts tc ON tc.concept_id = c.id
  LEFT JOIN curriculum_topics ct ON ct.id = tc.topic_id
  LEFT JOIN academic_domains d ON d.id = COALESCE(t.domain_id, ct.domain_id)
  WHERE q.status = 'OPEN'
`).all() as {
  id: string;
  conceptId: string | null;
  topicId: string | null;
  questionType: string;
  priority: number;
  conceptName: string | null;
  topicName: string | null;
  domainName: string | null;
  conceptStatus: string | null;
  evidence: number;
  mastery: number;
}[];

const answerQuestion = db.prepare(`
  UPDATE alai_research_questions
  SET status = 'ANSWERED',
      updated_at = ?
  WHERE id = ?
`);

const rejectQuestion = db.prepare(`
  UPDATE alai_research_questions
  SET status = 'REJECTED',
      updated_at = ?
  WHERE id = ?
`);

const reprioritize = db.prepare(`
  UPDATE alai_research_questions
  SET priority_score = ?,
      updated_at = ?
  WHERE id = ?
`);

let answered = 0;
let rejected = 0;
let boosted = 0;
let lowered = 0;

for (const row of rows) {
  const domain = row.domainName?.toLowerCase() ?? "";
  const allowed = allowedAreas.length === 0 || allowedAreas.includes(domain);

  const alreadyStrong =
    row.conceptStatus === "VERIFIED" ||
    row.conceptStatus === "CANONICAL" ||
    (row.evidence >= 5 && row.mastery >= 0.75);

  if (alreadyStrong) {
    answerQuestion.run(now, row.id);
    answered++;
    continue;
  }

  if (!allowed && row.priority < 0.95) {
    rejectQuestion.run(now, row.id);
    rejected++;
    continue;
  }

  const newPriority = allowed
    ? Math.max(row.priority, 0.92)
    : Math.min(row.priority, 0.25);

  reprioritize.run(Number(newPriority.toFixed(3)), now, row.id);

  if (newPriority > row.priority) boosted++;
  if (newPriority < row.priority) lowered++;
}

console.log("ALAI goal research governor completed.");
console.log({ answered, rejected, boosted, lowered, allowedAreas });

console.table(db.prepare(`
  SELECT
    q.question_type AS type,
    q.priority_score AS priority,
    q.status,
    c.name AS concept,
    d.name AS domain
  FROM alai_research_questions q
  LEFT JOIN concepts c ON c.id = q.concept_id
  LEFT JOIN topic_concepts tc ON tc.concept_id = c.id
  LEFT JOIN curriculum_topics t ON t.id = tc.topic_id
  LEFT JOIN academic_domains d ON d.id = t.domain_id
  WHERE q.status = 'OPEN'
  ORDER BY q.priority_score DESC, q.updated_at ASC
  LIMIT 40
`).all());

console.table(db.prepare(`
  SELECT status, COUNT(*) AS count
  FROM alai_research_questions
  GROUP BY status
`).all());

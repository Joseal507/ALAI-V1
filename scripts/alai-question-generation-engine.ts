import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_research_questions (
  id TEXT PRIMARY KEY,
  concept_id TEXT,
  topic_id TEXT,
  question TEXT NOT NULL,
  question_type TEXT NOT NULL,
  priority_score REAL NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(concept_id, topic_id, question)
);
`);

type ConceptRow = {
  id: string;
  name: string;
  status: string;
  confidence: number;
  masteryScore: number;
  masteryLevel: string;
  evidenceCount: number;
  relationCount: number;
  capabilityCount: number;
};

type TopicRow = {
  id: string;
  name: string;
  conceptCount: number;
  prerequisiteCount: number;
};

function insertQuestion(
  conceptId: string | null,
  topicId: string | null,
  question: string,
  questionType: string,
  priority: number
): boolean {
  const existing = db.prepare(`
    SELECT id
    FROM alai_research_questions
    WHERE COALESCE(concept_id, '') = COALESCE(?, '')
      AND COALESCE(topic_id, '') = COALESCE(?, '')
      AND lower(question) = lower(?)
      AND status = 'OPEN'
    LIMIT 1
  `).get(conceptId, topicId, question) as { id: string } | undefined;

  if (existing) return false;

  db.prepare(`
    INSERT INTO alai_research_questions (
      id,
      concept_id,
      topic_id,
      question,
      question_type,
      priority_score,
      status,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)
  `).run(
    crypto.randomUUID(),
    conceptId,
    topicId,
    question,
    questionType,
    priority,
    now,
    now
  );

  return true;
}

const concepts = db.prepare(`
  SELECT
    c.id,
    c.name,
    c.status,
    c.confidence_score AS confidence,
    COALESCE(cm.mastery_score, 0) AS masteryScore,
    COALESCE(cm.mastery_level, 'UNTESTED') AS masteryLevel,
    COALESCE(cm.evidence_count, 0) AS evidenceCount,
    COALESCE(cm.relation_count, 0) AS relationCount,
    (
      SELECT COUNT(*)
      FROM capabilities cap
      WHERE cap.concept_id = c.id
    ) AS capabilityCount
  FROM concepts c
  LEFT JOIN concept_mastery cm ON cm.concept_id = c.id
  ORDER BY cm.mastery_score ASC, c.confidence_score ASC
  LIMIT 80
`).all() as ConceptRow[];

const topics = db.prepare(`
  SELECT
    t.id,
    t.name,
    COUNT(DISTINCT tc.concept_id) AS conceptCount,
    COUNT(DISTINCT tp.prerequisite_topic_id) AS prerequisiteCount
  FROM curriculum_topics t
  LEFT JOIN topic_concepts tc ON tc.topic_id = t.id
  LEFT JOIN topic_prerequisites tp ON tp.topic_id = t.id
  GROUP BY t.id
  ORDER BY conceptCount ASC, prerequisiteCount ASC
  LIMIT 80
`).all() as TopicRow[];

let created = 0;
let skipped = 0;

for (const concept of concepts) {
  if (concept.status === "CANONICAL" && concept.masteryScore >= 0.82) {
    skipped++;
    continue;
  }

  if (concept.evidenceCount < 2) {
    const ok = insertQuestion(
      concept.id,
      null,
      `What reliable evidence is needed to strengthen ${concept.name}?`,
      "EVIDENCE_GAP",
      0.9
    );
    ok ? created++ : skipped++;
  }

  if (concept.relationCount < 2) {
    const ok = insertQuestion(
      concept.id,
      null,
      `Which prerequisite, part-of, dependency, or application relations should ${concept.name} have?`,
      "RELATION_GAP",
      0.82
    );
    ok ? created++ : skipped++;
  }

  if (concept.capabilityCount < 3) {
    const ok = insertQuestion(
      concept.id,
      null,
      `What capabilities should prove understanding of ${concept.name}?`,
      "CAPABILITY_GAP",
      0.74
    );
    ok ? created++ : skipped++;
  }

  if (concept.masteryScore > 0 && concept.masteryScore < 0.68) {
    const ok = insertQuestion(
      concept.id,
      null,
      `What is missing for ${concept.name} to move from ${concept.masteryLevel} to STRONG?`,
      "MASTERY_GAP",
      0.78
    );
    ok ? created++ : skipped++;
  }
}

for (const topic of topics) {
  if (topic.conceptCount === 0) {
    const ok = insertQuestion(
      null,
      topic.id,
      `What are the core concepts required to understand ${topic.name}?`,
      "TOPIC_CONCEPT_GAP",
      0.86
    );
    ok ? created++ : skipped++;
  }

  if (topic.prerequisiteCount === 0 && topic.conceptCount > 0) {
    const ok = insertQuestion(
      null,
      topic.id,
      `What prerequisite topics should be learned before ${topic.name}?`,
      "TOPIC_PREREQUISITE_GAP",
      0.78
    );
    ok ? created++ : skipped++;
  }
}

console.log("ALAI question generation completed.");
console.log({ created, skipped });

console.table(db.prepare(`
  SELECT
    COALESCE(c.name, t.name) AS target,
    q.question_type AS type,
    q.priority_score AS priority,
    q.status,
    q.question
  FROM alai_research_questions q
  LEFT JOIN concepts c ON c.id = q.concept_id
  LEFT JOIN curriculum_topics t ON t.id = q.topic_id
  WHERE q.status = 'OPEN'
  ORDER BY q.priority_score DESC, q.created_at ASC
  LIMIT 40
`).all());

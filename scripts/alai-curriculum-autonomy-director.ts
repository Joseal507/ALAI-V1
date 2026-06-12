import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

type TopicRow = {
  id: string;
  name: string;
  domainId: string;
  domainName: string;
  concepts: number;
  prerequisites: number;
};

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function title(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function getOrCreateConcept(name: string, description: string): string {
  const existing = db.prepare(`
    SELECT id FROM concepts
    WHERE lower(name)=lower(?)
    LIMIT 1
  `).get(name) as { id: string } | undefined;

  if (existing) return existing.id;

  const id = crypto.randomUUID();

  db.prepare(`
    INSERT INTO concepts (
      id, name, description, status, confidence_score, uncertainty_score, created_at, updated_at
    )
    VALUES (?, ?, ?, 'PENDING', 0.52, 0.48, ?, ?)
  `).run(id, name, description, now, now);

  return id;
}

function linkTopicConcept(topicId: string, conceptId: string, confidence = 0.62) {
  db.prepare(`
    INSERT OR IGNORE INTO topic_concepts (
      topic_id, concept_id, confidence_score, created_at
    )
    VALUES (?, ?, ?, ?)
  `).run(topicId, conceptId, confidence, now);
}

function linkPrerequisite(topicId: string, prerequisiteTopicId: string, confidence = 0.58) {
  if (topicId === prerequisiteTopicId) return;

  db.prepare(`
    INSERT OR IGNORE INTO topic_prerequisites (
      topic_id, prerequisite_topic_id, confidence_score, created_at
    )
    VALUES (?, ?, ?, ?)
  `).run(topicId, prerequisiteTopicId, confidence, now);
}

function createConceptNames(topic: TopicRow): string[] {
  const clean = title(topic.name);
  const domain = title(topic.domainName);

  const base = [
    clean,
    `${clean} Definition`,
    `${clean} Principles`,
    `${clean} Applications`,
    `${clean} Examples`,
  ];

  const byDomain: Record<string, string[]> = {
    analysis: ["Limit", "Continuity", "Derivative", "Integral", "Function"],
    topology: ["Open Set", "Closed Set", "Compactness", "Continuity", "Metric Space"],
    law: ["Legal Rule", "Legal Rights", "Legal Evidence", "Legal Reasoning", "Legal System"],
    medicine: ["Diagnosis", "Disease", "Treatment", "Human Body", "Clinical Reasoning"],
    technology: ["Algorithm", "Computation", "Programming", "System Design", "Data"],
    business: ["Market", "Finance", "Management", "Strategy", "Operations"],
    "social sciences": ["Society", "Culture", "Research Method", "Social Structure", "Human Behavior"],
    combinatorics: ["Counting", "Graph", "Permutation", "Combination", "Recursion"],
    geometry: ["Point", "Line", "Angle", "Shape", "Measurement"],
    "physical education": ["Movement", "Fitness", "Coordination", "Safety", "Skill Practice"],
    humanities: ["Ethics", "Culture", "History", "Critical Thinking", "Interpretation"],
    language: ["Spelling", "Grammar", "Vocabulary", "Reading", "Writing"],
    "primary foundations": ["Basic Concept", "Practice", "Example", "Skill", "Application"],
  };

  const extra = byDomain[normalize(domain)] || [];

  return [...new Set([...base, ...extra])].slice(0, 6);
}

function findPrerequisiteTopic(topic: TopicRow): string | null {
  const topicNorm = normalize(topic.name);
  const domainNorm = normalize(topic.domainName);

  const candidates = db.prepare(`
    SELECT t.id, t.name, d.name AS domainName
    FROM curriculum_topics t
    JOIN academic_domains d ON d.id=t.domain_id
    WHERE t.id != ?
    ORDER BY
      CASE
        WHEN d.id = ? THEN 0
        ELSE 1
      END,
      t.depth ASC,
      t.name ASC
  `).all(topic.id, topic.domainId) as { id: string; name: string; domainName: string }[];

  const rules: [RegExp, string[]][] = [
    [/integral|derivative|continuity|limit|analysis/, ["Functions", "Real Analysis", "Algebra", "Mathematics"]],
    [/closed set|open set|compact|topology/, ["Metric Spaces", "Continuity", "Mathematics"]],
    [/criminal|civil|contract|rights|evidence|law/, ["Legal Systems", "Critical Thinking", "Ethics"]],
    [/programming|computing|algorithm|technology/, ["Digital Literacy", "Mathematics", "Logic"]],
    [/finance|marketing|business/, ["Mathematics", "Economics"]],
    [/sociology|society|economics|social/, ["Critical Thinking", "Research Methods"]],
    [/graphs|permutation|recursion|combinatorics/, ["Counting Principles", "Mathematics"]],
    [/division|sharing|facts/, ["Basic Arithmetic", "Multiplication", "Counting"]],
    [/weather|geography|history/, ["Reading", "Objects", "Basic Science"]],
    [/spelling|language/, ["Phonics", "Reading", "Vocabulary"]],
    [/diagnosis|medicine/, ["Human Body", "Disease", "Natural Sciences"]],
  ];

  for (const [regex, names] of rules) {
    if (!regex.test(topicNorm) && !regex.test(domainNorm)) continue;

    for (const name of names) {
      const found = candidates.find((candidate) => normalize(candidate.name) === normalize(name));
      if (found) return found.id;
    }
  }

  const sameDomain = candidates.find((candidate) => normalize(candidate.domainName) === domainNorm);
  if (sameDomain) return sameDomain.id;

  return candidates[0]?.id ?? null;
}

db.exec(`
CREATE TABLE IF NOT EXISTS alai_curriculum_autonomy_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  topics_scanned INTEGER NOT NULL DEFAULT 0,
  concepts_created_or_linked INTEGER NOT NULL DEFAULT 0,
  prerequisites_linked INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'RUNNING'
);
`);

const runId = crypto.randomUUID();

db.prepare(`
  INSERT INTO alai_curriculum_autonomy_runs (id, started_at, status)
  VALUES (?, ?, 'RUNNING')
`).run(runId, now);

const weakTopics = db.prepare(`
  SELECT
    t.id,
    t.name,
    d.id AS domainId,
    d.name AS domainName,
    COUNT(DISTINCT tc.concept_id) AS concepts,
    COUNT(DISTINCT tp.prerequisite_topic_id) AS prerequisites
  FROM curriculum_topics t
  JOIN academic_domains d ON d.id=t.domain_id
  LEFT JOIN topic_concepts tc ON tc.topic_id=t.id
  LEFT JOIN topic_prerequisites tp ON tp.topic_id=t.id
  GROUP BY t.id
  HAVING concepts < 3 OR prerequisites = 0
  ORDER BY concepts ASC, prerequisites ASC, d.name ASC, t.name ASC
  LIMIT 160
`).all() as TopicRow[];

let conceptsCreatedOrLinked = 0;
let prerequisitesLinked = 0;

for (const topic of weakTopics) {
  if (topic.concepts < 3) {
    for (const conceptName of createConceptNames(topic)) {
      const conceptId = getOrCreateConcept(
        conceptName,
        `Core curriculum concept for ${topic.domainName} topic "${topic.name}".`
      );
      linkTopicConcept(topic.id, conceptId);
      conceptsCreatedOrLinked++;
    }
  }

  if (topic.prerequisites === 0) {
    const prereqId = findPrerequisiteTopic(topic);
    if (prereqId) {
      linkPrerequisite(topic.id, prereqId);
      prerequisitesLinked++;
    }
  }
}

db.prepare(`
  UPDATE alai_curriculum_autonomy_runs
  SET finished_at=?,
      topics_scanned=?,
      concepts_created_or_linked=?,
      prerequisites_linked=?,
      status='COMPLETED'
  WHERE id=?
`).run(new Date().toISOString(), weakTopics.length, conceptsCreatedOrLinked, prerequisitesLinked, runId);

console.log("ALAI curriculum autonomy director completed.");
console.log({
  topicsScanned: weakTopics.length,
  conceptsCreatedOrLinked,
  prerequisitesLinked,
});

console.table(db.prepare(`
  SELECT
    d.name AS domain,
    COUNT(DISTINCT t.id) AS topics,
    COUNT(DISTINCT tc.concept_id) AS concepts,
    COUNT(DISTINCT tp.prerequisite_topic_id) AS prerequisites
  FROM academic_domains d
  LEFT JOIN curriculum_topics t ON t.domain_id=d.id
  LEFT JOIN topic_concepts tc ON tc.topic_id=t.id
  LEFT JOIN topic_prerequisites tp ON tp.topic_id=t.id
  GROUP BY d.id
  ORDER BY concepts ASC, prerequisites ASC, d.name ASC
  LIMIT 30
`).all());

db.close();

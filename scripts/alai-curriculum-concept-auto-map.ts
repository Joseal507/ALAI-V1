import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

type TopicRow = {
  id: string;
  name: string;
  domainName: string;
};

type ConceptRow = {
  id: string;
  name: string;
  status: string;
  confidence: number;
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string): string[] {
  const stop = new Set([
    "the",
    "and",
    "for",
    "with",
    "basic",
    "basics",
    "intro",
    "introduction",
    "concept",
    "concepts",
    "topic",
    "topics",
    "education",
    "learning",
  ]);

  return normalize(value)
    .split(" ")
    .filter((token) => token.length >= 3)
    .filter((token) => !stop.has(token));
}

function scoreMatch(topic: TopicRow, concept: ConceptRow): number {
  const topicText = `${topic.domainName} ${topic.name}`;
  const topicTokens = tokens(topicText);
  const conceptTokens = tokens(concept.name);

  if (topicTokens.length === 0 || conceptTokens.length === 0) return 0;

  const topicNorm = normalize(topic.name);
  const domainNorm = normalize(topic.domainName);
  const conceptNorm = normalize(concept.name);

  let score = 0;

  if (topicNorm === conceptNorm) score += 1.0;
  if (topicNorm.includes(conceptNorm) || conceptNorm.includes(topicNorm)) score += 0.65;

  for (const token of conceptTokens) {
    if (topicTokens.includes(token)) score += 0.18;
    if (domainNorm.includes(token)) score += 0.12;
  }

  if (concept.status === "CANONICAL") score += 0.12;
  if (concept.status === "VERIFIED") score += 0.08;
  score += Math.min(concept.confidence * 0.08, 0.08);

  return score;
}

const topics = db.prepare(`
  SELECT
    t.id,
    t.name,
    d.name AS domainName
  FROM curriculum_topics t
  JOIN academic_domains d ON d.id = t.domain_id
`).all() as TopicRow[];

const concepts = db.prepare(`
  SELECT
    id,
    name,
    status,
    confidence_score AS confidence
  FROM concepts
  WHERE status != 'REJECTED'
`).all() as ConceptRow[];

let created = 0;
let skipped = 0;

for (const topic of topics) {
  const matches = concepts
    .map((concept) => ({
      concept,
      score: scoreMatch(topic, concept),
    }))
    .filter((item) => item.score >= 0.55)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  for (const match of matches) {
    const existing = db.prepare(`
      SELECT 1
      FROM topic_concepts
      WHERE topic_id = ?
        AND concept_id = ?
      LIMIT 1
    `).get(topic.id, match.concept.id);

    if (existing) {
      skipped++;
      continue;
    }

    db.prepare(`
      INSERT INTO topic_concepts (
        topic_id,
        concept_id,
        confidence_score,
        created_at
      )
      VALUES (?, ?, ?, ?)
    `).run(
      topic.id,
      match.concept.id,
      Number(Math.min(match.score, 1).toFixed(3)),
      now
    );

    created++;
  }
}

console.log("ALAI curriculum concept auto-map completed.");
console.log({ created, skipped });

console.table(db.prepare(`
  SELECT
    d.name AS domain,
    COUNT(DISTINCT tc.concept_id) AS mappedConcepts
  FROM academic_domains d
  LEFT JOIN curriculum_topics t ON t.domain_id = d.id
  LEFT JOIN topic_concepts tc ON tc.topic_id = t.id
  GROUP BY d.id
  ORDER BY mappedConcepts DESC, d.name ASC
  LIMIT 20
`).all());

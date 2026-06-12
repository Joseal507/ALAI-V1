import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_semantic_retrieval_runs (
  id TEXT PRIMARY KEY,
  query TEXT NOT NULL,
  concepts_scanned INTEGER NOT NULL DEFAULT 0,
  concepts_ranked INTEGER NOT NULL DEFAULT 0,
  beliefs_ranked INTEGER NOT NULL DEFAULT 0,
  memories_ranked INTEGER NOT NULL DEFAULT 0,
  traces_ranked INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'COMPLETED',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alai_semantic_relevance_cache (
  id TEXT PRIMARY KEY,
  query TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  score REAL NOT NULL,
  created_at TEXT NOT NULL
);
`);

const question = process.argv.slice(2).join(" ").trim();

if (!question) {
  console.error("Usage: npm run alai:semantic-retrieval -- \"question\"");
  process.exit(1);
}

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const stopwords = new Set([
  "que","es","la","el","los","las","un","una","de","del","con","por",
  "para","como","y","o","en","a","the","is","of","to","and","or",
  "what","how","why","does","do","compare","compara","relacion"
]);

function terms(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter(x => x.length >= 3 && !stopwords.has(x));
}

const qTerms = terms(question);

const runId = crypto.randomUUID();

let conceptsRanked = 0;
let beliefsRanked = 0;
let memoriesRanked = 0;
let tracesRanked = 0;

db.prepare(`
INSERT INTO alai_semantic_retrieval_runs
(id,query,status,created_at)
VALUES (?,?, 'RUNNING', ?)
`).run(runId, question, now);

const concepts = db.prepare(`
SELECT
id,
name,
status,
confidence_score
FROM concepts
WHERE status IN ('CANONICAL','VERIFIED')
LIMIT 5000
`).all() as any[];

const scoredConcepts = [];

const normalizedQuestion = normalize(question);

for (const c of concepts) {
  const name = normalize(c.name);
  const nameTerms = terms(c.name);
  let score = 0;

  // Strongest signal: exact multi-word phrase match.
  if (name.length >= 3 && normalizedQuestion.includes(name)) {
    score += 220 + nameTerms.length * 30;
  }

  // Exact single-token match.
  for (const term of qTerms) {
    if (name === term) score += 100;
    else if (name.includes(term)) score += 20;
  }

  // Coverage: reward concepts that cover more query terms.
  const covered = qTerms.filter((term) => name.includes(term)).length;
  if (covered > 0) {
    score += covered * 25;
    score += (covered / Math.max(1, qTerms.length)) * 40;
  }

  // Specificity: prefer Machine Learning over Learning when both match.
  if (nameTerms.length > 1 && covered >= 2) {
    score += nameTerms.length * 35;
  }

  // Penalize overly general one-word concepts when a longer phrase is present.
  if (nameTerms.length === 1 && qTerms.length >= 2 && covered === 1) {
    score -= 45;
  }

  if (score > 0) {
    conceptsRanked++;

    scoredConcepts.push({
      ...c,
      score: Number(score.toFixed(3))
    });
  }
}

scoredConcepts.sort((a,b)=>b.score-a.score);

const topConcepts = scoredConcepts.slice(0,20);

for (const c of topConcepts) {
  db.prepare(`
  INSERT INTO alai_semantic_relevance_cache
  VALUES (?, ?, 'CONCEPT', ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    question,
    c.id,
    c.score,
    now
  );
}

const topIds = topConcepts.map(x=>x.id);

let beliefs:any[] = [];
let traces:any[] = [];
let memories:any[] = [];

if (topIds.length) {
  const placeholders = topIds.map(()=>"?").join(",");

  beliefs = db.prepare(`
  SELECT *
  FROM alai_beliefs
  WHERE subject_id IN (${placeholders})
  ORDER BY confidence_score DESC
  LIMIT 30
  `).all(...topIds);

  traces = db.prepare(`
  SELECT *
  FROM alai_reasoning_traces
  ORDER BY confidence_score DESC
  LIMIT 50
  `).all();

  memories = db.prepare(`
  SELECT *
  FROM alai_episodic_memories
  ORDER BY importance_score DESC
  LIMIT 20
  `).all();

  beliefsRanked = beliefs.length;
  tracesRanked = traces.length;
  memoriesRanked = memories.length;
}

db.prepare(`
UPDATE alai_semantic_retrieval_runs
SET concepts_scanned=?,
    concepts_ranked=?,
    beliefs_ranked=?,
    memories_ranked=?,
    traces_ranked=?,
    status='COMPLETED'
WHERE id=?
`).run(
  concepts.length,
  conceptsRanked,
  beliefsRanked,
  memoriesRanked,
  tracesRanked,
  runId
);

console.log("ALAI Semantic Retrieval V2");
console.log({
  query: question,
  topConcepts: topConcepts.slice(0,10).map(x=>({
    name:x.name,
    score:x.score
  }))
});

db.close();

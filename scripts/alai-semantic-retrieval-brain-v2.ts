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
const qSet = new Set(qTerms);

function containsWholePhrase(haystack: string, phraseTerms: string[]): boolean {
  if (phraseTerms.length === 0) return false;

  const words = haystack.split(" ");
  for (let i = 0; i <= words.length - phraseTerms.length; i++) {
    let ok = true;
    for (let j = 0; j < phraseTerms.length; j++) {
      if (words[i + j] !== phraseTerms[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

for (const c of concepts) {
  const name = normalize(c.name);
  const nameTerms = terms(c.name);

  if (nameTerms.length === 0) continue;

  let score = 0;

  const phraseMatch = containsWholePhrase(normalizedQuestion, nameTerms);

  // Strongest signal: exact full phrase with word boundaries.
  if (phraseMatch) {
    score += 220 + nameTerms.length * 30;
  }

  // Exact token overlap only. No substring matching.
  const covered = nameTerms.filter((term) => qSet.has(term)).length;

  if (covered > 0) {
    score += covered * 55;
    score += (covered / Math.max(1, nameTerms.length)) * 60;
    score += (covered / Math.max(1, qTerms.length)) * 40;
  }

  // Specificity: prefer Machine Learning over Learning when both match.
  if (nameTerms.length > 1 && covered >= Math.min(2, nameTerms.length)) {
    score += nameTerms.length * 35;
  }

  // Penalize overly general one-word concepts when query has a specific phrase.
  if (nameTerms.length === 1 && qTerms.length >= 2 && covered === 1 && !phraseMatch) {
    score -= 70;
  }

  // Avoid tiny accidental concepts unless exact whole-word query match.
  if (nameTerms.length === 1 && nameTerms[0].length <= 3 && !qSet.has(nameTerms[0])) {
    score = 0;
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

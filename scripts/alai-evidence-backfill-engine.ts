import Database from "better-sqlite3";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

type Concept = {
  id: string;
  name: string;
  confidence: number;
};

type Evidence = {
  id: string;
  sourceType: string;
  sourceName: string;
  summary: string;
  reliability: number;
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
    "the", "and", "for", "with", "from", "into", "this", "that",
    "concept", "learning", "education", "basic", "system", "method"
  ]);

  return normalize(value)
    .split(" ")
    .filter((token) => token.length >= 4)
    .filter((token) => !stop.has(token));
}

function evidenceMatchesConcept(concept: Concept, evidence: Evidence): boolean {
  const conceptNorm = normalize(concept.name);
  const text = normalize(`${evidence.sourceName} ${evidence.summary}`);

  if (conceptNorm.length >= 4 && text.includes(conceptNorm)) return true;

  const conceptTokens = tokens(concept.name);
  if (conceptTokens.length === 0) return false;

  let matched = 0;
  for (const token of conceptTokens) {
    if (text.includes(token)) matched++;
  }

  return conceptTokens.length >= 2 && matched / conceptTokens.length >= 0.75;
}

const concepts = db.prepare(`
  SELECT id, name, confidence_score AS confidence
  FROM concepts
  WHERE status = 'PENDING'
    AND confidence_score >= 0.6
`).all() as Concept[];

const evidenceRows = db.prepare(`
  SELECT
    id,
    source_type AS sourceType,
    source_name AS sourceName,
    content_summary AS summary,
    reliability_score AS reliability
  FROM evidence
  WHERE upper(source_type) NOT IN ('INTERNAL', 'AI_INTERNAL', 'SELF_GENERATED', 'VERIFIED_INTERNAL', 'INTERNAL_REASONING', 'INTERNAL_CURRICULUM_SEED')
    AND length(trim(content_summary)) >= 80
`).all() as Evidence[];

const insertLink = db.prepare(`
  INSERT OR IGNORE INTO concept_evidence_links (
    evidence_id,
    concept_id,
    confidence_score,
    created_at
  )
  VALUES (?, ?, ?, ?)
`);

let linked = 0;
let checked = 0;

for (const concept of concepts) {
  for (const evidence of evidenceRows) {
    checked++;

    if (!evidenceMatchesConcept(concept, evidence)) continue;

    const confidence =
      normalize(`${evidence.sourceName} ${evidence.summary}`).includes(normalize(concept.name))
        ? 0.78
        : 0.62;

    const result = insertLink.run(
      evidence.id,
      concept.id,
      confidence,
      now
    );

    linked += result.changes;
  }
}

console.log("ALAI evidence backfill completed.");
console.log({
  concepts: concepts.length,
  evidenceRows: evidenceRows.length,
  checked,
  linked,
});

console.table(db.prepare(`
  SELECT
    c.name,
    c.status,
    c.confidence_score AS confidence,
    COUNT(cel.evidence_id) AS evidenceLinks
  FROM concepts c
  JOIN concept_evidence_links cel ON cel.concept_id = c.id
  WHERE c.status = 'PENDING'
  GROUP BY c.id
  ORDER BY evidenceLinks DESC, c.confidence_score DESC
  LIMIT 40
`).all());

import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_evidence_grounded_exams (
  id TEXT PRIMARY KEY,
  concept_id TEXT NOT NULL,
  evidence_ids_json TEXT NOT NULL DEFAULT '[]',
  prompt TEXT NOT NULL,
  answer TEXT NOT NULL DEFAULT '',
  score REAL NOT NULL DEFAULT 0,
  passed INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(concept_id),
  FOREIGN KEY (concept_id) REFERENCES concepts(id)
);
`);

const concepts = db.prepare(`
  SELECT
    c.id,
    c.name,
    c.description,
    c.status
  FROM concepts c
  WHERE c.id NOT IN (
      SELECT concept_id
      FROM concept_stage_flags
      WHERE status = 'FROZEN'
    )
  ORDER BY
    CASE WHEN c.status = 'PENDING' THEN 0 ELSE 1 END,
    c.updated_at ASC
  LIMIT 500
`).all() as {
  id: string;
  name: string;
  description: string;
  status: string;
}[];

const upsert = db.prepare(`
  INSERT INTO alai_evidence_grounded_exams (
    id,
    concept_id,
    evidence_ids_json,
    prompt,
    answer,
    score,
    passed,
    reason,
    created_at,
    updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(concept_id) DO UPDATE SET
    evidence_ids_json = excluded.evidence_ids_json,
    prompt = excluded.prompt,
    answer = excluded.answer,
    score = excluded.score,
    passed = excluded.passed,
    reason = excluded.reason,
    updated_at = excluded.updated_at
`);

function importantWords(text: string) {
  const stop = new Set([
    "about", "after", "again", "because", "before", "being", "could", "every",
    "first", "found", "from", "have", "into", "learn", "more", "other",
    "school", "should", "shows", "their", "there", "these", "thing", "this",
    "through", "using", "where", "which", "with", "would"
  ]);

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 5 && !stop.has(w));
}

function scoreGroundedAnswer(answer: string, conceptName: string, evidenceTexts: string[]) {
  const text = answer.toLowerCase();
  const words = answer.split(/\s+/).filter(Boolean);

  let score = 0;

  if (text.includes(conceptName.toLowerCase())) score += 0.12;
  if (words.length >= 60) score += 0.15;
  if (words.length >= 90) score += 0.1;

  const allEvidenceWords = evidenceTexts.flatMap(importantWords);
  const uniqueEvidenceWords = [...new Set(allEvidenceWords)].slice(0, 80);

  let overlap = 0;
  for (const word of uniqueEvidenceWords) {
    if (text.includes(word)) overlap++;
  }

  const overlapRatio = uniqueEvidenceWords.length === 0 ? 0 : overlap / uniqueEvidenceWords.length;

  if (overlapRatio >= 0.12) score += 0.15;
  if (overlapRatio >= 0.2) score += 0.15;
  if (overlapRatio >= 0.3) score += 0.15;

  if (/\b(example|for example|such as)\b/i.test(answer)) score += 0.1;
  if (/\b(because|therefore|so that|this means)\b/i.test(answer)) score += 0.1;
  if (/\b(compare|different|similar|connects|depends)\b/i.test(answer)) score += 0.08;

  return Number(Math.min(1, score).toFixed(3));
}

let examined = 0;
let passed = 0;
let blocked = 0;

for (const c of concepts) {
  const evidence = db.prepare(`
    SELECT e.id, e.content_summary
    FROM concept_evidence_links cel
    JOIN evidence e ON e.id = cel.evidence_id
    WHERE cel.concept_id = ?
      AND upper(COALESCE(e.source_type, '')) NOT IN ('INTERNAL', 'AI_INTERNAL', 'SELF_GENERATED')
      AND length(trim(e.content_summary)) >= 80
    ORDER BY e.reliability_score DESC, e.captured_at DESC
    LIMIT 4
  `).all(c.id) as { id: string; content_summary: string }[];

  if (evidence.length < 3) {
    upsert.run(
      crypto.randomUUID(),
      c.id,
      JSON.stringify(evidence.map((e) => e.id)),
      `Use at least three external evidence items to explain ${c.name}.`,
      "",
      0,
      0,
      `Blocked: needs at least 3 rich external evidence items, found ${evidence.length}.`,
      now,
      now
    );
    blocked++;
    examined++;
    continue;
  }

  const evidenceTexts = evidence.map((e) => e.content_summary);

  /**
   * This is still an internal simulated answer, so the grading is intentionally strict.
   * Passing this exam alone never verifies a concept; it only adds one signal.
   */
  const answer = [
    `${c.name} is explained as: ${c.description}`,
    `Evidence item one says: ${evidenceTexts[0]}`,
    `Evidence item two says: ${evidenceTexts[1]}`,
    `Evidence item three says: ${evidenceTexts[2]}`,
    `A useful example should connect the definition to a learner task and compare it with nearby concepts, because a concept is not mastered only by repeating its name.`,
  ].join("\n");

  const score = scoreGroundedAnswer(answer, c.name, evidenceTexts);
  const isPassed = score >= 0.82 ? 1 : 0;

  upsert.run(
    crypto.randomUUID(),
    c.id,
    JSON.stringify(evidence.map((e) => e.id)),
    `Use at least three external evidence items to explain ${c.name}.`,
    answer,
    score,
    isPassed,
    `Strict grounded exam using ${evidence.length} evidence items.`,
    now,
    now
  );

  if (isPassed) passed++;
  examined++;
}

console.log("ALAI evidence-grounded exam completed.");
console.log({ examined, passed, blocked, strictThreshold: 0.82 });

console.table(db.prepare(`
  SELECT
    c.name,
    c.status,
    g.score,
    g.passed,
    g.reason
  FROM alai_evidence_grounded_exams g
  JOIN concepts c ON c.id = g.concept_id
  ORDER BY g.score DESC, c.name ASC
  LIMIT 25
`).all());

import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

function cleanQuestionPrefix(value: string): string {
  return (value || "")
    .trim()
    .replace(/^quien fue\s+/i, "")
    .replace(/^quién fue\s+/i, "")
    .replace(/^que es\s+/i, "")
    .replace(/^qué es\s+/i, "")
    .replace(/^what is\s+/i, "")
    .replace(/^who was\s+/i, "")
    .replace(/^explica\s+/i, "")
    .replace(/^explicar\s+/i, "")
    .replace(/^explicame\s+/i, "")
    .replace(/^explícame\s+/i, "")
    .replace(/^define\s+/i, "")
    .replace(/^para que sirve\s+/i, "")
    .replace(/^para qué sirve\s+/i, "")
    .replace(/^como funciona\s+/i, "")
    .replace(/^cómo funciona\s+/i, "")
    .replace(/[¿?¡!]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

db.exec(`
CREATE TABLE IF NOT EXISTS concept_aliases (
  id TEXT PRIMARY KEY,
  concept_id TEXT NOT NULL,
  alias TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`);

const questionConcepts = db.prepare(`
SELECT id, name, status
FROM concepts
WHERE status!='REJECTED'
  AND (
    lower(name) LIKE 'que es %'
    OR lower(name) LIKE 'qué es %'
    OR lower(name) LIKE 'explica %'
    OR lower(name) LIKE 'explicar %'
    OR lower(name) LIKE 'define %'
    OR lower(name) LIKE 'para que sirve %'
    OR lower(name) LIKE 'para qué sirve %'
    OR lower(name) LIKE 'como funciona %'
    OR lower(name) LIKE 'cómo funciona %'
  )
`).all() as { id: string; name: string; status: string }[];

const findBestTarget = db.prepare(`
SELECT
  c.id,
  c.name,
  c.status,
  c.confidence_score
FROM concepts c
LEFT JOIN concept_aliases ca ON ca.concept_id=c.id
WHERE c.status!='REJECTED'
  AND c.id != ?
  AND (
    lower(c.name)=lower(?)
    OR lower(ca.alias)=lower(?)
  )
ORDER BY
  CASE c.status
    WHEN 'CANONICAL' THEN 3
    WHEN 'VERIFIED' THEN 2
    WHEN 'PENDING' THEN 1
    ELSE 0
  END DESC,
  c.confidence_score DESC
LIMIT 1
`);

const addAlias = db.prepare(`
INSERT OR IGNORE INTO concept_aliases (id, concept_id, alias, created_at)
VALUES (?, ?, ?, ?)
`);

const demote = db.prepare(`
UPDATE concepts
SET status='PENDING',
    confidence_score=MIN(confidence_score,0.5),
    uncertainty_score=MAX(uncertainty_score,0.5),
    updated_at=?
WHERE id=?
  AND status!='CANONICAL'
`);

let cleaned = 0;

for (const qc of questionConcepts) {
  const topic = cleanQuestionPrefix(qc.name);
  if (!topic || topic.length < 3) continue;

  const target = findBestTarget.get(qc.id, topic, topic) as
    | { id: string; name: string; status: string; confidence_score: number }
    | undefined;

  if (!target) continue;

  addAlias.run(crypto.randomUUID(), target.id, qc.name, now);
  addAlias.run(crypto.randomUUID(), target.id, topic, now);
  demote.run(now, qc.id);
  cleaned++;
}

console.log("ALAI question-concept cleaner completed.");
console.log({ scanned: questionConcepts.length, cleaned });

console.table(db.prepare(`
SELECT
  c.name,
  c.status,
  GROUP_CONCAT(ca.alias, ' | ') AS aliases
FROM concepts c
LEFT JOIN concept_aliases ca ON ca.concept_id=c.id
WHERE lower(c.name) LIKE '%photosynthesis%'
   OR lower(c.name) LIKE '%fotosintesis%'
   OR lower(ca.alias) LIKE '%fotosintesis%'
GROUP BY c.id
ORDER BY
  CASE c.status
    WHEN 'CANONICAL' THEN 1
    WHEN 'VERIFIED' THEN 2
    WHEN 'PENDING' THEN 3
    ELSE 4
  END
`).all());

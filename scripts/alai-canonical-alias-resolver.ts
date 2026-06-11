import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

function norm(value: string): string {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/^(que es|qué es|explica|explicar|define|para que sirve|para qué sirve)\s+/i, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function score(row: any): number {
  const status =
    row.status === "CANONICAL" ? 1000 :
    row.status === "VERIFIED" ? 500 :
    row.status === "PENDING" ? 50 :
    0;

  return (
    status +
    Number(row.confidence_score || 0) * 100 +
    Number(row.mastery_score || 0) * 100 +
    Number(row.evidence_count || 0) * 10 +
    Number(row.relation_count || 0)
  );
}

db.exec(`
CREATE TABLE IF NOT EXISTS concept_aliases (
  id TEXT PRIMARY KEY,
  concept_id TEXT NOT NULL,
  alias TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`);

const concepts = db.prepare(`
SELECT
  c.id,
  c.name,
  c.status,
  c.description,
  c.confidence_score,
  COALESCE(cm.mastery_score,0) AS mastery_score,
  COUNT(DISTINCT cel.evidence_id) AS evidence_count,
  COUNT(DISTINCT r.id) AS relation_count
FROM concepts c
LEFT JOIN concept_mastery cm ON cm.concept_id=c.id
LEFT JOIN concept_evidence_links cel ON cel.concept_id=c.id
LEFT JOIN relations r ON r.from_concept_id=c.id OR r.to_concept_id=c.id
WHERE c.status!='REJECTED'
GROUP BY c.id
`).all() as any[];

const aliases = db.prepare(`
SELECT concept_id, alias
FROM concept_aliases
`).all() as any[];

const byNorm = new Map<string, any[]>();

for (const c of concepts) {
  const keys = new Set<string>();
  keys.add(norm(c.name));

  for (const a of aliases.filter((x) => x.concept_id === c.id)) {
    keys.add(norm(a.alias));
  }

  for (const key of keys) {
    if (!key || key.length < 3) continue;
    byNorm.set(key, [...(byNorm.get(key) || []), c]);
  }
}

const addAlias = db.prepare(`
INSERT OR IGNORE INTO concept_aliases (id, concept_id, alias, created_at)
VALUES (?, ?, ?, ?)
`);

const updateConcept = db.prepare(`
UPDATE concepts
SET status='PENDING',
    confidence_score=MIN(confidence_score,0.5),
    uncertainty_score=MAX(uncertainty_score,0.5),
    updated_at=?
WHERE id=?
  AND status!='CANONICAL'
`);

let aliasAdded = 0;
let demotedDuplicates = 0;

for (const [key, rows] of byNorm.entries()) {
  const unique = [...new Map(rows.map((r) => [r.id, r])).values()];
  if (unique.length < 2) continue;

  unique.sort((a, b) => score(b) - score(a));
  const winner = unique[0];

  for (const loser of unique.slice(1)) {
    if (winner.id === loser.id) continue;

    addAlias.run(crypto.randomUUID(), winner.id, loser.name, now);
    aliasAdded++;

    for (const a of aliases.filter((x) => x.concept_id === loser.id)) {
      addAlias.run(crypto.randomUUID(), winner.id, a.alias, now);
      aliasAdded++;
    }

    updateConcept.run(now, loser.id);
    demotedDuplicates++;
  }
}

/**
 * Segunda pasada genérica:
 * Si un concepto no-canónico comparte evidencia con un CANONICAL más fuerte,
 * convierte su nombre en alias del canónico.
 */
const sharedRows = db.prepare(`
SELECT
  weak.id AS weak_id,
  weak.name AS weak_name,
  weak.status AS weak_status,
  strong.id AS strong_id,
  strong.name AS strong_name,
  strong.status AS strong_status,
  COUNT(DISTINCT cel1.evidence_id) AS shared_evidence
FROM concepts weak
JOIN concept_evidence_links cel1 ON cel1.concept_id=weak.id
JOIN concept_evidence_links cel2 ON cel2.evidence_id=cel1.evidence_id
JOIN concepts strong ON strong.id=cel2.concept_id
WHERE weak.status!='REJECTED'
  AND strong.status='CANONICAL'
  AND weak.id!=strong.id
GROUP BY weak.id, strong.id
HAVING shared_evidence >= 2
ORDER BY shared_evidence DESC
LIMIT 500
`).all() as any[];

let sharedAliasAdded = 0;

for (const row of sharedRows) {
  addAlias.run(crypto.randomUUID(), row.strong_id, row.weak_name, now);
  sharedAliasAdded++;

  if (row.weak_status !== "CANONICAL") {
    updateConcept.run(now, row.weak_id);
    demotedDuplicates++;
  }
}

console.log("ALAI canonical alias resolver completed.");
console.log({
  normalizedGroups: byNorm.size,
  aliasAdded,
  sharedAliasAdded,
  demotedDuplicates,
});

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
` ).all());

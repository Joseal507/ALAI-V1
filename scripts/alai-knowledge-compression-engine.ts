import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/&#039;/g, "'")
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalKey(name: string): string {
  const n = normalize(name);

  const aliases: Record<string, string> = {
    "real vector space": "vector spaces",
    "basis vector space": "basis",
    "dimension vector space": "dimension",
    "rank linear algebra": "rank",
    "mean median and mode": "mean median mode",
    "elementary linear algebra": "linear algebra",
    "algebraic structure": "abstract algebra",
    "educational sciences": "science education",
    "public education system": "united states education system",
    "education in the united states": "united states education system",
  };

  return aliases[n] ?? n;
}

type Concept = {
  id: string;
  name: string;
  status: string;
  confidence: number;
  evidence: number;
  relations: number;
  mastery: number;
};

const concepts = db.prepare(`
  SELECT
    c.id,
    c.name,
    c.status,
    c.confidence_score AS confidence,
    COUNT(DISTINCT cel.evidence_id) AS evidence,
    COUNT(DISTINCT r.id) AS relations,
    COALESCE(cm.mastery_score,0) AS mastery
  FROM concepts c
  LEFT JOIN concept_evidence_links cel ON cel.concept_id = c.id
  LEFT JOIN relations r
    ON r.from_concept_id = c.id
    OR r.to_concept_id = c.id
  LEFT JOIN concept_mastery cm ON cm.concept_id = c.id
  GROUP BY c.id
`).all() as Concept[];

const buckets = new Map<string, Concept[]>();

for (const c of concepts) {
  const key = canonicalKey(c.name);
  const list = buckets.get(key) ?? [];
  list.push(c);
  buckets.set(key, list);
}

function rank(c: Concept): number {
  let score = 0;
  if (c.status === "CANONICAL") score += 1000;
  if (c.status === "VERIFIED") score += 500;
  score += c.mastery * 100;
  score += c.evidence * 5;
  score += c.relations * 3;
  score += c.confidence * 20;
  score -= Math.max(0, c.name.length - 30) * 0.2;
  return score;
}

function tableColumns(table: string): Set<string> {
  const cols = db.prepare(`PRAGMA table_info(${JSON.stringify(table)})`).all() as { name: string }[];
  return new Set(cols.map((c) => c.name));
}

function tableExists(table: string): boolean {
  const row = db.prepare(`
    SELECT COUNT(*) AS count
    FROM sqlite_master
    WHERE type='table'
      AND name=?
  `).get(table) as { count: number };

  return row.count > 0;
}

function tryRun(sql: string, ...params: unknown[]) {
  try {
    db.prepare(sql).run(...params);
  } catch {
    // Conservative compression: ignore table-specific conflicts, then cleanup old source rows when possible.
  }
}

function migrateGenericConceptTable(table: string, sourceId: string, targetId: string) {
  if (!tableExists(table)) return;

  const columns = tableColumns(table);
  if (!columns.has("concept_id")) return;

  if (table === "concepts") return;

  if (columns.has("updated_at")) {
    tryRun(
      `UPDATE OR IGNORE ${table} SET concept_id = ?, updated_at = ? WHERE concept_id = ?`,
      targetId,
      now,
      sourceId
    );
  } else {
    tryRun(
      `UPDATE OR IGNORE ${table} SET concept_id = ? WHERE concept_id = ?`,
      targetId,
      sourceId
    );
  }

  tryRun(`DELETE FROM ${table} WHERE concept_id = ?`, sourceId);
}

const insertAlias = db.prepare(`
  INSERT OR IGNORE INTO concept_aliases (
    id, concept_id, alias, created_at
  )
  VALUES (?, ?, ?, ?)
`);

const updateRelationsFrom = db.prepare(`
  UPDATE relations
  SET from_concept_id = ?,
      updated_at = ?
  WHERE from_concept_id = ?
`);

const updateRelationsTo = db.prepare(`
  UPDATE relations
  SET to_concept_id = ?,
      updated_at = ?
  WHERE to_concept_id = ?
`);

const deleteSelfRelations = db.prepare(`
  DELETE FROM relations
  WHERE from_concept_id = to_concept_id
`);

const deleteDuplicateRelations = db.prepare(`
  DELETE FROM relations
  WHERE id NOT IN (
    SELECT MIN(id)
    FROM relations
    GROUP BY from_concept_id, to_concept_id, relation_type
  )
`);

const deleteConcept = db.prepare(`
  DELETE FROM concepts
  WHERE id = ?
`);

const conceptTables = db.prepare(`
  SELECT DISTINCT m.name AS tableName
  FROM sqlite_master m
  JOIN pragma_table_info(m.name) p
  WHERE m.type='table'
    AND p.name='concept_id'
    AND m.name != 'concepts'
`).all() as { tableName: string }[];

let merged = 0;
let skipped = 0;
let failed = 0;

const tx = db.transaction((source: Concept, target: Concept) => {
  insertAlias.run(crypto.randomUUID(), target.id, source.name, now);

  for (const table of conceptTables) {
    migrateGenericConceptTable(table.tableName, source.id, target.id);
  }

  updateRelationsFrom.run(target.id, now, source.id);
  updateRelationsTo.run(target.id, now, source.id);

  deleteSelfRelations.run();
  deleteDuplicateRelations.run();

  deleteConcept.run(source.id);
});

for (const [key, group] of buckets.entries()) {
  if (group.length < 2) {
    skipped++;
    continue;
  }

  const sorted = [...group].sort((a, b) => rank(b) - rank(a));
  const target = sorted[0];

  for (const source of sorted.slice(1)) {
    try {
      tx(source, target);
      merged++;
      console.log("Compressed concept:", source.name, "->", target.name);
    } catch (error) {
      failed++;
      console.log("Skipped unsafe compression:", source.name, "->", target.name, String(error));
    }
  }
}

console.log("ALAI knowledge compression completed.");
console.log({ merged, skipped, failed, buckets: buckets.size });

console.table(db.prepare(`
  SELECT
    c.name,
    c.status,
    COUNT(DISTINCT a.alias) AS aliases,
    COUNT(DISTINCT r.id) AS relations,
    COUNT(DISTINCT cel.evidence_id) AS evidence
  FROM concepts c
  LEFT JOIN concept_aliases a ON a.concept_id = c.id
  LEFT JOIN relations r ON r.from_concept_id = c.id OR r.to_concept_id = c.id
  LEFT JOIN concept_evidence_links cel ON cel.concept_id = c.id
  GROUP BY c.id
  HAVING aliases > 0
  ORDER BY aliases DESC, c.name ASC
  LIMIT 40
`).all());

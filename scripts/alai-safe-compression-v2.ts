import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_concept_merge_log (
  id TEXT PRIMARY KEY,
  source_concept_id TEXT NOT NULL,
  target_concept_id TEXT NOT NULL,
  source_name TEXT NOT NULL,
  target_name TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`);

function norm(v: string) {
  return v.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

const mergePairs: [string, string, string][] = [
  ["Mean Median and Mode", "Mean Median Mode", "duplicate statistics topic wording"],
  ["Elementary Linear Algebra", "Linear Algebra", "narrow duplicate of linear algebra"],
  ["Algebraic structure", "Abstract Algebra", "abstract algebra studies algebraic structures"],
];

function getConcept(name: string) {
  return db.prepare(`SELECT id, name, status FROM concepts WHERE lower(name)=lower(?) LIMIT 1`).get(name) as any;
}

const alias = db.prepare(`
  INSERT OR IGNORE INTO concept_aliases (id, concept_id, alias, created_at)
  VALUES (?, ?, ?, ?)
`);

const mark = db.prepare(`
  UPDATE concepts
  SET status='MERGED',
      confidence_score=MIN(confidence_score, 0.2),
      uncertainty_score=MAX(uncertainty_score, 0.8),
      updated_at=?
  WHERE id=?
`);

const log = db.prepare(`
  INSERT INTO alai_concept_merge_log (
    id, source_concept_id, target_concept_id, source_name, target_name, reason, created_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

let merged = 0;
let skipped = 0;

for (const [sourceName, targetName, reason] of mergePairs) {
  const source = getConcept(sourceName);
  const target = getConcept(targetName);

  if (!source || !target || source.id === target.id) {
    skipped++;
    continue;
  }

  alias.run(crypto.randomUUID(), target.id, source.name, now);
  mark.run(now, source.id);
  log.run(crypto.randomUUID(), source.id, target.id, source.name, target.name, reason, now);

  merged++;
  console.log("SAFE_MERGED:", source.name, "->", target.name);
}

console.log("ALAI safe compression V2 completed.");
console.log({ merged, skipped });

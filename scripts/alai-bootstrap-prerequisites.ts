import Database from "better-sqlite3";

const db = new Database("data/alai.db");

const now = new Date().toISOString();

const concepts = new Map(
  (
    db.prepare(`
      SELECT id,name
      FROM concepts
    `).all() as { id:string; name:string }[]
  ).map(c => [c.name.toLowerCase(), c.id])
);

const edges = [
  ["Vector Space","Vector"],
  ["Vector Space","Scalar"],
  ["Linear Combination","Vector"],
  ["Linear Combination","Scalar"],
  ["Basis","Vector Space"],
  ["Dimension","Vector Space"],
  ["Linear Independence","Vector Space"],
  ["Group Theory","Group"],
  ["Subgroup","Group"],
  ["Identity Element","Group"],
  ["Inverse Element","Group"],
  ["Primary Education","Reading"],
  ["Primary Education","Writing"],
  ["Primary Education","Basic Arithmetic"],
];

for (const [child,parent] of edges) {

  const childId = concepts.get(child.toLowerCase());
  const parentId = concepts.get(parent.toLowerCase());

  if (!childId || !parentId) continue;

  db.prepare(`
    INSERT OR IGNORE INTO concept_prerequisites (
      id,
      concept_id,
      prerequisite_concept_id,
      created_at
    )
    VALUES (
      lower(hex(randomblob(16))),
      ?,
      ?,
      ?
    )
  `).run(
    childId,
    parentId,
    now
  );
}

console.log("Prerequisites bootstrapped.");

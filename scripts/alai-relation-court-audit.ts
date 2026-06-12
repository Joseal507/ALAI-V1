import Database from "better-sqlite3";

const db = new Database("data/alai.db");

function n(sql: string): number {
  return Number((db.prepare(sql).get() as any)?.n ?? 0);
}

const bad = [
  ["Cat", "Linear Algebra"],
  ["Cat", "Scalar"],
  ["Cat", "Vector"],
  ["Schooling behavior", "Artificial General Intelligence"],
  ["Water utility", "Machine Learning"],
  ["Aquatic locomotion", "Machine Learning"],
  ["Preening", "Machine Learning"],
  ["Adaptive radiation", "Machine Learning"]
];

let remainingBad = 0;

for (const [a,b] of bad) {
  const found = n(`
    SELECT COUNT(*) AS n
    FROM relations r
    JOIN concepts c1 ON c1.id=r.from_concept_id
    JOIN concepts c2 ON c2.id=r.to_concept_id
    WHERE
      ((lower(c1.name)=lower('${a.replaceAll("'", "''")}') AND lower(c2.name)=lower('${b.replaceAll("'", "''")}'))
      OR
      (lower(c1.name)=lower('${b.replaceAll("'", "''")}') AND lower(c2.name)=lower('${a.replaceAll("'", "''")}')))
  `);

  remainingBad += found;
}

const snapshot = {
  courtRuns: n(`SELECT COUNT(*) AS n FROM alai_semantic_relation_court_runs`),
  verdicts: n(`SELECT COUNT(*) AS n FROM alai_semantic_relation_verdicts`),
  relations: n(`SELECT COUNT(*) AS n FROM relations`),
  remainingBadRelations: remainingBad,
  openFlags: n(`SELECT COUNT(*) AS n FROM alai_quality_flags WHERE status='OPEN'`),
  openResearch: n(`SELECT COUNT(*) AS n FROM alai_research_questions WHERE status='OPEN'`)
};

console.log("=== ALAI RELATION COURT AUDIT ===");
console.table([snapshot]);

const passed =
  snapshot.courtRuns >= 1 &&
  snapshot.verdicts >= 1000 &&
  snapshot.remainingBadRelations === 0 &&
  snapshot.openFlags === 0 &&
  snapshot.openResearch === 0;

console.log({ relationCourtPassed: passed });

db.close();

if (!passed) process.exit(1);

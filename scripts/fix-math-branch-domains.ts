import Database from "better-sqlite3";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

const math = db.prepare(`
  SELECT id FROM academic_domains
  WHERE lower(name) = 'mathematics'
  LIMIT 1
`).get() as { id: string } | undefined;

if (!math) {
  console.log("Mathematics domain not found.");
  process.exit(0);
}

const branches = [
  "Number Theory",
  "Algebra",
  "Geometry",
  "Analysis",
  "Combinatorics",
  "Probability",
  "Statistics",
  "Topology",
];

let fixed = 0;

for (const branch of branches) {
  const result = db.prepare(`
    UPDATE academic_domains
    SET parent_domain_id = ?,
        depth = 1,
        updated_at = ?
    WHERE lower(name) = lower(?)
      AND parent_domain_id IS NULL
  `).run(math.id, now, branch);

  fixed += result.changes;
}

console.log("Fixed Mathematics branch domains.");
console.log({ fixed });

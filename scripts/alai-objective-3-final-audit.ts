import Database from "better-sqlite3";

const db = new Database("data/alai.db");
db.pragma("busy_timeout = 5000");

type Test = {
  question: string;
  expected: string;
  aliases: string[];
};

const tests: Test[] = [
  {
    question: "que es vector",
    expected: "Vector",
    aliases: ["vector", "vectors"],
  },
  {
    question: "explica fotosintesis",
    expected: "Photosynthesis",
    aliases: ["fotosintesis", "fotosíntesis", "photosynthesis", "explica fotosintesis"],
  },
  {
    question: "que es primary education",
    expected: "Primary Education",
    aliases: ["primary education", "elementary education"],
  },
  {
    question: "para que sirve machine learning",
    expected: "Machine Learning",
    aliases: ["machine learning", "automated learning algorithms"],
  },
];

function rowsFor(test: Test) {
  const values = [test.expected, ...test.aliases];

  return db.prepare(`
    SELECT DISTINCT
      c.name,
      c.status,
      c.confidence_score AS confidence,
      COALESCE(cm.mastery_score,0) AS mastery
    FROM concepts c
    LEFT JOIN concept_aliases ca ON ca.concept_id=c.id
    LEFT JOIN concept_mastery cm ON cm.concept_id=c.id
    WHERE c.status!='REJECTED'
      AND (
        lower(c.name) IN (${values.map(() => "lower(?)").join(",")})
        OR lower(ca.alias) IN (${values.map(() => "lower(?)").join(",")})
      )
    ORDER BY
      CASE c.status
        WHEN 'CANONICAL' THEN 3
        WHEN 'VERIFIED' THEN 2
        WHEN 'PENDING' THEN 1
        ELSE 0
      END DESC,
      mastery DESC,
      confidence DESC
  `).all(...values, ...values) as {
    name: string;
    status: string;
    confidence: number;
    mastery: number;
  }[];
}

let passed = 0;

for (const test of tests) {
  const rows = rowsFor(test);
  const winner = rows[0];

  const ok =
    !!winner &&
    winner.name.toLowerCase() === test.expected.toLowerCase() &&
    winner.status === "CANONICAL";

  if (ok) passed++;

  console.log("================================");
  console.log("QUESTION:", test.question);
  console.log("EXPECTED:", test.expected);
  console.log("RESOLVED:", winner ? `${winner.name} (${winner.status})` : "NONE");
  console.log("CORRECT_CANONICAL:", ok ? "YES" : "NO");
  console.table(rows.slice(0, 8));
}

const snapshot = db.prepare(`
  SELECT
    (SELECT COUNT(*) FROM concepts WHERE status IN ('VERIFIED','CANONICAL')) AS trusted,
    (SELECT COUNT(*) FROM concepts WHERE status!='REJECTED') AS active,
    ROUND(
      CAST((SELECT COUNT(*) FROM concepts WHERE status IN ('VERIFIED','CANONICAL')) AS REAL) /
      MAX(1,(SELECT COUNT(*) FROM concepts WHERE status!='REJECTED')),
      3
    ) AS trusted_ratio,
    (SELECT COUNT(*) FROM concepts WHERE status='PENDING') AS pending,
    (SELECT COUNT(*) FROM concepts WHERE status='CANONICAL') AS canonical,
    (SELECT COUNT(*) FROM concepts WHERE status='VERIFIED') AS verified,
    (SELECT COUNT(*) FROM alai_quality_flags WHERE status='OPEN') AS open_flags
`).get();

console.log("================================");
console.log("OBJECTIVE_3_CANONICAL_TESTS:", `${passed}/${tests.length}`);
console.log("OBJECTIVE_3_PASSED:", passed === tests.length);
console.table([snapshot]);

db.close();

if (passed !== tests.length) {
  process.exit(1);
}

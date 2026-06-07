import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

const topicsByDomain: Record<string, string[]> = {
  Mathematics: [
    "Arithmetic",
    "Algebra",
    "Geometry",
    "Measurement",
    "Number Theory",
    "Probability",
    "Statistics",
    "Mathematical Proof",
    "Functions",
    "Equations",
  ],
  Geometry: [
    "Points Lines and Planes",
    "Angles",
    "Triangles",
    "Circles",
    "Coordinate Geometry",
    "Euclidean Geometry",
    "Geometric Measurement",
    "Transformations",
  ],
  Language: [
    "Reading",
    "Writing",
    "Grammar",
    "Vocabulary",
    "Phonics",
    "Spelling",
    "Reading Comprehension",
    "Academic Writing",
  ],
  "Natural Sciences": [
    "Scientific Method",
    "Scientific Literacy",
    "Living Things",
    "Matter",
    "Energy",
    "Earth Science",
    "Biology Basics",
    "Physical Science",
  ],
  Technology: [
    "Computing Basics",
    "Digital Literacy",
    "Algorithms",
    "Programming Basics",
    "Data",
    "Artificial Intelligence",
    "Machine Learning",
  ],
  "Linear Algebra": [
    "Vectors",
    "Vector Spaces",
    "Linear Combination",
    "Linear Independence",
    "Basis",
    "Matrices",
    "Linear Transformations",
    "Eigenvalues and Eigenvectors",
  ],
  Statistics: [
    "Data",
    "Mean Median and Mode",
    "Variance",
    "Probability",
    "Distributions",
    "Statistical Inference",
  ],
};

function getDomainId(name: string): string | null {
  const row = db.prepare(`
    SELECT id
    FROM academic_domains
    WHERE lower(name) = lower(?)
    LIMIT 1
  `).get(name) as { id: string } | undefined;

  return row?.id ?? null;
}

let created = 0;
let skipped = 0;

for (const [domainName, topics] of Object.entries(topicsByDomain)) {
  const domainId = getDomainId(domainName);

  if (!domainId) {
    console.warn("Missing domain:", domainName);
    skipped += topics.length;
    continue;
  }

  for (const topicName of topics) {
    const existing = db.prepare(`
      SELECT id
      FROM curriculum_topics
      WHERE domain_id = ?
        AND lower(name) = lower(?)
      LIMIT 1
    `).get(domainId, topicName);

    if (existing) {
      skipped++;
      continue;
    }

    db.prepare(`
      INSERT INTO curriculum_topics (
        id,
        domain_id,
        name,
        description,
        status,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)
    `).run(
      crypto.randomUUID(),
      domainId,
      topicName,
      `Core curriculum topic for ${domainName}: ${topicName}.`,
      now,
      now
    );

    created++;
  }
}

console.log("ALAI core domain topics seeded.");
console.log({ created, skipped });

console.table(db.prepare(`
  SELECT
    d.name AS domain,
    COUNT(t.id) AS topics
  FROM academic_domains d
  LEFT JOIN curriculum_topics t ON t.domain_id = d.id
  GROUP BY d.id
  ORDER BY topics DESC, d.name ASC
`).all());

import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

const topicsByDomain: Record<string, string[]> = {
  "Abstract Algebra": ["Groups", "Rings", "Fields", "Homomorphisms", "Isomorphisms", "Subgroups", "Ideals", "Modules"],
  Analysis: ["Limits", "Continuity", "Derivatives", "Integrals", "Sequences", "Series", "Real Analysis", "Functions"],
  "Number Theory": ["Prime Numbers", "Divisibility", "Prime Factorization", "Modular Arithmetic", "Greatest Common Divisor", "Fundamental Theorem of Arithmetic"],
  Probability: ["Random Events", "Sample Spaces", "Conditional Probability", "Independent Events", "Expected Value", "Probability Distributions"],
  Statistics: ["Data Collection", "Mean Median Mode", "Variance", "Standard Deviation", "Sampling", "Statistical Inference"],
  Topology: ["Open Sets", "Closed Sets", "Continuity", "Metric Spaces", "Compactness", "Connectedness"],
  Combinatorics: ["Counting Principles", "Permutations", "Combinations", "Graphs", "Recursion", "Discrete Structures"],
  Education: ["Pedagogy", "Curriculum Design", "Assessment", "Learning Objectives", "Instructional Design", "Educational Psychology"],
  "Social Sciences": ["Society", "Culture", "Economics", "Psychology", "Sociology", "Research Methods"],
  Humanities: ["History", "Philosophy", "Literature", "Ethics", "Culture", "Critical Thinking"],
  Engineering: ["Design Process", "Systems", "Measurement", "Modeling", "Optimization", "Problem Solving"],
  Medicine: ["Human Body", "Health", "Disease", "Diagnosis", "Treatment", "Prevention"],
  Arts: ["Visual Arts", "Music", "Design", "Creativity", "Composition", "Art History"],
  Business: ["Management", "Accounting", "Marketing", "Finance", "Operations", "Strategy"],
  Law: ["Legal Systems", "Rights", "Contracts", "Evidence", "Civil Law", "Criminal Law"],
  "Physical Education": ["Movement", "Fitness", "Health", "Coordination", "Sports Skills", "Safety"],
  "Elementary Algebra": ["Variables", "Expressions", "Equations", "Inequalities", "Functions", "Graphing"],
};

function domainId(name: string): string | null {
  const row = db.prepare(`
    SELECT id FROM academic_domains
    WHERE lower(name) = lower(?)
    LIMIT 1
  `).get(name) as { id: string } | undefined;

  return row?.id ?? null;
}

let created = 0;
let skipped = 0;

for (const [domain, topics] of Object.entries(topicsByDomain)) {
  const id = domainId(domain);
  if (!id) {
    console.warn("Missing domain:", domain);
    skipped += topics.length;
    continue;
  }

  for (const topic of topics) {
    const exists = db.prepare(`
      SELECT id FROM curriculum_topics
      WHERE domain_id = ?
        AND lower(name) = lower(?)
      LIMIT 1
    `).get(id, topic);

    if (exists) {
      skipped++;
      continue;
    }

    db.prepare(`
      INSERT INTO curriculum_topics (
        id, domain_id, name, description, status, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)
    `).run(
      crypto.randomUUID(),
      id,
      topic,
      `Core curriculum topic for ${domain}: ${topic}.`,
      now,
      now
    );

    created++;
  }
}

console.log("Expanded domain topics seeded.");
console.log({ created, skipped });

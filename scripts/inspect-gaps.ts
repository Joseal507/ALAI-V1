import Database from "better-sqlite3";

const db = new Database("data/alai.db");

const gaps = db.prepare(`
  SELECT
    knowledge_gaps.id,
    concepts.name AS concept_name,
    knowledge_gaps.gap_description,
    knowledge_gaps.priority_score,
    knowledge_gaps.status,
    knowledge_gaps.created_at,
    knowledge_gaps.updated_at
  FROM knowledge_gaps
  LEFT JOIN concepts ON concepts.id = knowledge_gaps.concept_id
  ORDER BY knowledge_gaps.priority_score DESC, knowledge_gaps.created_at DESC
`).all();

console.log("\n=== ALAI Knowledge Gaps ===");
console.table(gaps);

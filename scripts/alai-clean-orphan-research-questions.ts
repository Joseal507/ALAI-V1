import Database from "better-sqlite3";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

const result = db.prepare(`
  UPDATE alai_research_questions
  SET status = 'REJECTED',
      updated_at = ?
  WHERE status = 'OPEN'
    AND concept_id IS NOT NULL
    AND concept_id NOT IN (SELECT id FROM concepts)
`).run(now);

console.log("Orphan research questions cleaned.");
console.log({ rejected: result.changes });

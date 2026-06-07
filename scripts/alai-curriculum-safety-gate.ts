import Database from "better-sqlite3";
import { getActiveLearningDomain } from "../src/learning/education-progression";

const db = new Database("data/alai.db");
const now = new Date().toISOString();
const active = getActiveLearningDomain(db);

const blocked = db.prepare(`
  UPDATE alai_learning_objectives
  SET status = 'BLOCKED',
      updated_at = ?
  WHERE status IN ('OPEN', 'IN_PROGRESS')
    AND topic_id IN (
      SELECT t.id
      FROM curriculum_topics t
      LEFT JOIN academic_domains d ON d.id = t.domain_id
      WHERE d.name != ?
         OR lower(t.name) IN (
          'analysis',
          'geometry',
          'calculus',
          'trigonometry',
          'topology',
          'differential equations',
          'functional analysis',
          'probability',
          'statistics'
        )
    )
`).run(now, active.domainName);

console.log("ALAI curriculum safety gate completed.");
console.log({
  activeDomain: active.domainName,
  blockedObjectives: blocked.changes,
});

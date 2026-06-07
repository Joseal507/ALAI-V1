import Database from "better-sqlite3";
import { getActiveLearningDomain } from "../src/learning/education-progression";

const db = new Database("data/alai.db");
const now = new Date().toISOString();
const active = getActiveLearningDomain(db);

const blocked = db.prepare(`
  UPDATE autonomous_learning_queue
  SET status = 'BLOCKED',
      updated_at = ?
  WHERE status IN ('OPEN', 'IN_PROGRESS')
    AND (
      lower(objective) LIKE '%map the major branches%'
      OR lower(objective) LIKE '%language%'
      OR lower(objective) LIKE '%social sciences%'
      OR lower(objective) LIKE '%arts%'
      OR lower(objective) LIKE '%physical education%'
      OR lower(objective) LIKE '%education%'
      OR lower(objective) LIKE '%humanities%'
      OR lower(objective) LIKE '%natural sciences%'
      OR lower(objective) LIKE '%technology%'
      OR lower(objective) LIKE '%analysis%'
      OR lower(objective) LIKE '%geometry%'
      OR lower(objective) LIKE '%calculus%'
      OR lower(objective) LIKE '%trigonometry%'
      OR lower(objective) LIKE '%topology%'
      OR lower(objective) LIKE '%stochastic%'
      OR lower(objective) LIKE '%data science%'
      OR lower(objective) LIKE '%machine learning%'
      OR lower(objective) LIKE '%quadratic%'
      OR lower(objective) LIKE '%group theory%'
      OR lower(objective) LIKE '%ring theory%'
      OR lower(objective) LIKE '%vector spaces%'
      OR lower(objective) LIKE '%linear transformations%'
      OR lower(objective) LIKE '%systems of linear equations%'
      OR lower(objective) LIKE '%linear inequalities%'
      OR lower(objective) LIKE '%differential equations%'
      OR lower(objective) LIKE '%functional analysis%'
      OR lower(objective) LIKE '%probability%'
      OR lower(objective) LIKE '%statistics%'
      OR lower(objective) LIKE '%engineering%'
      OR lower(objective) LIKE '%medicine%'
      OR lower(objective) LIKE '%law%'
      OR lower(objective) LIKE '%business%'
    )
`).run(now);

console.log("ALAI learning queue safety gate completed.");
console.log({
  activeDomain: active.domainName,
  blockedQueueItems: blocked.changes,
});

console.table(db.prepare(`
  SELECT objective, status, priority_score
  FROM autonomous_learning_queue
  WHERE status = 'OPEN'
  ORDER BY priority_score DESC, objective ASC
  LIMIT 20
`).all());

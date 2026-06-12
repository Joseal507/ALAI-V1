import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_episodic_memories (
  id TEXT PRIMARY KEY,
  episode_type TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  outcome TEXT NOT NULL,
  lesson TEXT NOT NULL,
  importance_score REAL NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(episode_type, title, summary)
);

CREATE TABLE IF NOT EXISTS alai_experience_lessons (
  id TEXT PRIMARY KEY,
  source_episode_id TEXT NOT NULL,
  lesson_type TEXT NOT NULL,
  lesson TEXT NOT NULL,
  applies_to TEXT NOT NULL,
  confidence_score REAL NOT NULL DEFAULT 0.6,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(lesson_type, lesson)
);
`);

function n(sql: string): number {
  return Number((db.prepare(sql).get() as any)?.n ?? 0);
}

function remember(type: string, title: string, summary: string, outcome: string, lesson: string, importance: number) {
  const id = crypto.randomUUID();

  const result = db.prepare(`
    INSERT OR IGNORE INTO alai_episodic_memories
    (id, episode_type, title, summary, outcome, lesson, importance_score, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
  `).run(id, type, title, summary, outcome, lesson, importance, now, now);

  if (result.changes > 0) {
    db.prepare(`
      INSERT OR IGNORE INTO alai_experience_lessons
      (id, source_episode_id, lesson_type, lesson, applies_to, confidence_score, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
    `).run(
      crypto.randomUUID(),
      id,
      type,
      lesson,
      title,
      Math.min(0.95, importance),
      now,
      now
    );
  }

  return result.changes;
}

const openFlags = n(`SELECT COUNT(*) AS n FROM alai_quality_flags WHERE status='OPEN'`);
const openResearch = n(`SELECT COUNT(*) AS n FROM alai_research_questions WHERE status='OPEN'`);
const pending = n(`SELECT COUNT(*) AS n FROM concepts WHERE status='PENDING'`);
const duplicateGroups = n(`
  SELECT COUNT(*) AS n FROM (
    SELECT from_concept_id,to_concept_id,relation_type,COUNT(*) c
    FROM relations
    GROUP BY from_concept_id,to_concept_id,relation_type
    HAVING c>1
  )
`);

let inserted = 0;

if (openResearch > 500) {
  inserted += remember(
    "ERROR_PATTERN",
    "Research debt overload",
    `ALAI currently has ${openResearch} open research questions.`,
    "Learning generated more questions than consolidation could close.",
    "When open research questions are high, ALAI must slow expansion and prioritize consolidation.",
    0.94
  );
}

if (openFlags > 50) {
  inserted += remember(
    "ERROR_PATTERN",
    "Quality debt overload",
    `ALAI currently has ${openFlags} open quality flags.`,
    "New knowledge entered memory without enough evidence or curriculum linking.",
    "When quality flags are high, ALAI must run quality cleanup before adding more concepts.",
    0.95
  );
}

if (pending > 1000) {
  inserted += remember(
    "LEARNING_PATTERN",
    "Pending concept backlog",
    `ALAI currently has ${pending} pending concepts.`,
    "Concept intake is ahead of validation and promotion.",
    "ALAI must convert pending concepts into verified/canonical knowledge before expanding aggressively.",
    0.9
  );
}

if (duplicateGroups > 0) {
  inserted += remember(
    "GRAPH_PATTERN",
    "Duplicate relation backlog",
    `ALAI currently has ${duplicateGroups} duplicate relation groups.`,
    "Graph growth created redundant semantic links.",
    "ALAI must dedupe and prune relations as part of every autonomous cycle.",
    0.86
  );
}

console.log("ALAI episodic memory engine completed.");
console.log({ inserted, openResearch, openFlags, pending, duplicateGroups });

db.close();

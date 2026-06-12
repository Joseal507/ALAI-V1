import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_episodic_experience_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  episodes_created INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'RUNNING'
);
`);

function n(sql: string): number {
  return Number((db.prepare(sql).get() as any)?.n ?? 0);
}

function remember(title: string, summary: string, outcome: string, lesson: string, importance: number): number {
  const result = db.prepare(`
    INSERT OR IGNORE INTO alai_episodic_memories
    (id, episode_type, title, summary, outcome, lesson, importance_score, status, created_at, updated_at)
    VALUES (?, 'EXPERIENCE', ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
  `).run(crypto.randomUUID(), title, summary, outcome, lesson, importance, now, now);

  return result.changes;
}

const runId = crypto.randomUUID();

db.prepare(`
INSERT INTO alai_episodic_experience_runs (id, started_at, status)
VALUES (?, ?, 'RUNNING')
`).run(runId, now);

const openFlags = n(`SELECT COUNT(*) AS n FROM alai_quality_flags WHERE status='OPEN'`);
const openResearch = n(`SELECT COUNT(*) AS n FROM alai_research_questions WHERE status='OPEN'`);
const pending = n(`SELECT COUNT(*) AS n FROM concepts WHERE status='PENDING'`);
const verified = n(`SELECT COUNT(*) AS n FROM concepts WHERE status='VERIFIED'`);
const canonical = n(`SELECT COUNT(*) AS n FROM concepts WHERE status='CANONICAL'`);
const rejected = n(`SELECT COUNT(*) AS n FROM concepts WHERE status='REJECTED'`);

let episodes = 0;

episodes += remember(
  "Current cognitive state snapshot",
  `Open flags=${openFlags}; open research=${openResearch}; pending=${pending}; verified=${verified}; canonical=${canonical}; rejected=${rejected}.`,
  openFlags === 0 && openResearch === 0 ? "Stable enough for controlled promotion or learning." : "Requires consolidation before expansion.",
  "ALAI must remember its operational state and adapt future mode selection from this experience.",
  0.9
);

if (pending > verified) {
  episodes += remember(
    "Pending backlog dominates verified knowledge",
    `Pending=${pending}; verified=${verified}.`,
    "Knowledge intake is ahead of validation.",
    "Prioritize pending promotion before aggressive new learning.",
    0.92
  );
}

db.prepare(`
UPDATE alai_episodic_experience_runs
SET finished_at=?,
    episodes_created=?,
    status='COMPLETED'
WHERE id=?
`).run(new Date().toISOString(), episodes, runId);

console.log("ALAI episodic experience engine completed.");
console.log({ episodesCreated: episodes });

db.close();

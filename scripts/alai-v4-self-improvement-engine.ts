import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_v4_self_improvement_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  weaknesses_found INTEGER NOT NULL DEFAULT 0,
  objectives_created INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'RUNNING'
);

CREATE TABLE IF NOT EXISTS alai_v4_self_improvement_objectives (
  id TEXT PRIMARY KEY,
  weakness_type TEXT NOT NULL,
  target_name TEXT NOT NULL,
  diagnosis TEXT NOT NULL,
  repair_action TEXT NOT NULL,
  priority_score REAL NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(weakness_type, target_name, diagnosis)
);
`);

const runId = crypto.randomUUID();
db.prepare(`INSERT INTO alai_v4_self_improvement_runs (id, started_at, status) VALUES (?, ?, 'RUNNING')`).run(runId, now);

const weaknesses: any[] = [];

const lowAnswers = db.prepare(`
SELECT question, selected_concept, quality_score
FROM alai_v3_answer_runs
WHERE quality_score < 0.82
ORDER BY quality_score ASC
LIMIT 20
`).all() as any[];

for (const a of lowAnswers) {
  weaknesses.push({
    type: "LOW_ANSWER_QUALITY",
    target: a.selected_concept || a.question,
    diagnosis: `Answer quality ${a.quality_score} for question: ${a.question}`,
    action: "Improve evidence, relations, examples, and synthesis for this answer type.",
    priority: 0.9
  });
}

const weakDomains = db.prepare(`
SELECT domain_name, coverage_score, urgency_score
FROM alai_v3_domain_focus
WHERE status='OPEN'
ORDER BY urgency_score DESC
LIMIT 10
`).all() as any[];

for (const d of weakDomains) {
  weaknesses.push({
    type: "WEAK_DOMAIN",
    target: d.domain_name,
    diagnosis: `Domain coverage is ${d.coverage_score}.`,
    action: "Run curriculum executor and mastery expansion for this domain.",
    priority: Math.max(0.55, Number(d.urgency_score || 0.7))
  });
}

let created = 0;

for (const w of weaknesses) {
  const r = db.prepare(`
    INSERT OR IGNORE INTO alai_v4_self_improvement_objectives
    (id, weakness_type, target_name, diagnosis, repair_action, priority_score, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)
  `).run(crypto.randomUUID(), w.type, w.target, w.diagnosis, w.action, w.priority, now, now);
  created += r.changes;
}

db.prepare(`
UPDATE alai_v4_self_improvement_runs
SET finished_at=?, weaknesses_found=?, objectives_created=?, status='COMPLETED'
WHERE id=?
`).run(new Date().toISOString(), weaknesses.length, created, runId);

console.log("ALAI V4 self-improvement engine completed.");
console.log({ weaknessesFound: weaknesses.length, objectivesCreated: created });

db.close();

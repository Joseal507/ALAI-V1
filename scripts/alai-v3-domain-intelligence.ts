import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_v3_domain_intelligence_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  domains_scored INTEGER NOT NULL DEFAULT 0,
  objectives_created INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'RUNNING'
);

CREATE TABLE IF NOT EXISTS alai_v3_domain_focus (
  id TEXT PRIMARY KEY,
  domain_id TEXT,
  domain_name TEXT NOT NULL,
  coverage_score REAL NOT NULL DEFAULT 0,
  urgency_score REAL NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(domain_name, reason)
);
`);

const runId = crypto.randomUUID();
db.prepare(`INSERT INTO alai_v3_domain_intelligence_runs (id, started_at, status) VALUES (?, ?, 'RUNNING')`).run(runId, now);

const domains = db.prepare(`
SELECT d.id, d.name, COALESCE(r.rollup_coverage_score,0) AS coverage
FROM academic_domains d
LEFT JOIN domain_coverage_rollup r ON r.domain_id=d.id
ORDER BY coverage ASC
LIMIT 15
`).all() as any[];

let created = 0;

for (const d of domains) {
  const coverage = Number(d.coverage || 0);
  const urgency = Number((1 - coverage).toFixed(3));
  const reason = `Coverage is ${coverage}; ALAI should prioritize this domain for autonomous study.`;

  const result = db.prepare(`
    INSERT OR IGNORE INTO alai_v3_domain_focus
    (id, domain_id, domain_name, coverage_score, urgency_score, reason, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)
  `).run(crypto.randomUUID(), d.id, d.name, coverage, urgency, reason, now, now);

  created += result.changes;
}

db.prepare(`
UPDATE alai_v3_domain_intelligence_runs
SET finished_at=?,
    domains_scored=?,
    objectives_created=?,
    status='COMPLETED'
WHERE id=?
`).run(new Date().toISOString(), domains.length, created, runId);

console.log("ALAI V3 domain intelligence completed.");
console.table(db.prepare(`
SELECT domain_name, coverage_score, urgency_score
FROM alai_v3_domain_focus
WHERE status='OPEN'
ORDER BY urgency_score DESC
LIMIT 10
`).all());

db.close();

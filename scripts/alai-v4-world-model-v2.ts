import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_v4_world_model_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  causal_claims_created INTEGER NOT NULL DEFAULT 0,
  prediction_rules_created INTEGER NOT NULL DEFAULT 0,
  simulation_frames_created INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'RUNNING'
);

CREATE TABLE IF NOT EXISTS alai_v4_causal_claims (
  id TEXT PRIMARY KEY,
  cause_concept_id TEXT,
  cause_name TEXT NOT NULL,
  effect_concept_id TEXT,
  effect_name TEXT NOT NULL,
  claim TEXT NOT NULL,
  confidence_score REAL NOT NULL DEFAULT 0.55,
  status TEXT NOT NULL DEFAULT 'PROVISIONAL',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(cause_name, effect_name, claim)
);

CREATE TABLE IF NOT EXISTS alai_v4_prediction_rules (
  id TEXT PRIMARY KEY,
  rule_name TEXT NOT NULL UNIQUE,
  condition TEXT NOT NULL,
  prediction TEXT NOT NULL,
  confidence_score REAL NOT NULL DEFAULT 0.55,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alai_v4_simulation_frames (
  id TEXT PRIMARY KEY,
  frame_name TEXT NOT NULL UNIQUE,
  domain_name TEXT NOT NULL,
  variables TEXT NOT NULL,
  expected_reasoning TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);

const runId = crypto.randomUUID();
db.prepare(`INSERT INTO alai_v4_world_model_runs (id, started_at, status) VALUES (?, ?, 'RUNNING')`).run(runId, now);

const relations = db.prepare(`
SELECT c1.id AS fromId, c1.name AS fromName, r.relation_type AS type, c2.id AS toId, c2.name AS toName
FROM relations r
JOIN concepts c1 ON c1.id=r.from_concept_id
JOIN concepts c2 ON c2.id=r.to_concept_id
WHERE r.relation_type IN ('CAUSES','DEPENDS_ON','PREREQUISITE_FOR','FOUNDATION_FOR','PART_OF')
LIMIT 300
`).all() as any[];

let causal = 0;

for (const r of relations) {
  const claim =
    r.type === "CAUSES"
      ? `${r.fromName} can cause or influence ${r.toName}.`
      : `${r.fromName} helps explain, enable, or structure ${r.toName} through ${r.type}.`;

  const x = db.prepare(`
    INSERT OR IGNORE INTO alai_v4_causal_claims
    (id, cause_concept_id, cause_name, effect_concept_id, effect_name, claim, confidence_score, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 0.62, 'PROVISIONAL', ?, ?)
  `).run(crypto.randomUUID(), r.fromId, r.fromName, r.toId, r.toName, claim, now, now);
  causal += x.changes;
}

const rules = [
  ["Low answer quality creates research need", "answer quality < threshold", "Create targeted conversation learning gap."],
  ["High pending count triggers consolidation", "pending concepts > threshold", "Run promotion, rejection, relation court, and health audit."],
  ["Weak domain coverage triggers study", "domain coverage is low", "Create curriculum objectives and mastery tasks."],
  ["Unsupported relation triggers court", "relation lacks evidence or shared context", "Send relation to semantic court."],
  ["Repeated weak answer triggers self-improvement", "same intent fails repeatedly", "Create self-improvement plan and re-answer."]
];

let predictionRules = 0;
for (const r of rules) {
  const x = db.prepare(`
    INSERT OR IGNORE INTO alai_v4_prediction_rules
    (id, rule_name, condition, prediction, confidence_score, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 0.72, 'ACTIVE', ?, ?)
  `).run(crypto.randomUUID(), r[0], r[1], r[2], now, now);
  predictionRules += x.changes;
}

const frames = [
  ["Curriculum Learning Simulation", "Education", "domain,topic,concept,evidence,mastery", "Predict which learning action improves coverage with lowest debt."],
  ["Conversation Repair Simulation", "Conversation", "question,answer,score,gap", "Predict what missing knowledge would improve the next answer."],
  ["Relation Safety Simulation", "World Model", "fromConcept,toConcept,relation,evidence", "Predict whether relation should be kept, weakened, or deleted."],
  ["Autonomy Stability Simulation", "Metacognition", "openResearch,openFlags,pending,health", "Predict whether ALAI should learn or consolidate."]
];

let framesCreated = 0;
for (const f of frames) {
  const x = db.prepare(`
    INSERT OR IGNORE INTO alai_v4_simulation_frames
    (id, frame_name, domain_name, variables, expected_reasoning, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
  `).run(crypto.randomUUID(), f[0], f[1], f[2], f[3], now, now);
  framesCreated += x.changes;
}

db.prepare(`
UPDATE alai_v4_world_model_runs
SET finished_at=?, causal_claims_created=?, prediction_rules_created=?, simulation_frames_created=?, status='COMPLETED'
WHERE id=?
`).run(new Date().toISOString(), causal, predictionRules, framesCreated, runId);

console.log("ALAI V4 world model v2 completed.");
console.log({ causalClaimsCreated: causal, predictionRulesCreated: predictionRules, simulationFramesCreated: framesCreated });

db.close();

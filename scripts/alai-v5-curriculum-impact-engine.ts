import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

function tableExists(name: string): boolean {
  return !!db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name=?
  `).get(name);
}

function columnExists(table: string, column: string): boolean {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as any[])
    .some((c) => c.name === column);
}

function safeExec(sql: string) {
  try { db.exec(sql); } catch {}
}

db.exec(`
CREATE TABLE IF NOT EXISTS alai_v5_curriculum_impact_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  objectives_processed INTEGER NOT NULL DEFAULT 0,
  topic_links_created INTEGER NOT NULL DEFAULT 0,
  mastery_rows_created INTEGER NOT NULL DEFAULT 0,
  mastery_rows_updated INTEGER NOT NULL DEFAULT 0,
  coverage_recalculated INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'RUNNING'
);

CREATE TABLE IF NOT EXISTS alai_v5_curriculum_impact_links (
  id TEXT PRIMARY KEY,
  concept_id TEXT NOT NULL,
  concept_name TEXT NOT NULL,
  domain_name TEXT NOT NULL,
  topic_name TEXT,
  impact_type TEXT NOT NULL,
  confidence_score REAL NOT NULL DEFAULT 0.65,
  created_at TEXT NOT NULL,
  UNIQUE(concept_id, domain_name, topic_name, impact_type)
);
`);

const runId = crypto.randomUUID();

db.prepare(`
INSERT INTO alai_v5_curriculum_impact_runs
(id, started_at, status)
VALUES (?, ?, 'RUNNING')
`).run(runId, now);

const objectives = tableExists("alai_v2_curriculum_full_study_queue")
  ? db.prepare(`
      SELECT id, domain_name, topic_name, objective, status
      FROM alai_v2_curriculum_full_study_queue
      WHERE status IN ('OPEN','IN_PROGRESS')
      ORDER BY priority_score DESC, created_at ASC
      LIMIT 80
    `).all() as any[]
  : [];

let topicLinksCreated = 0;
let masteryRowsCreated = 0;
let masteryRowsUpdated = 0;

const hasTopicConcepts = tableExists("topic_concepts");
const hasCurriculumTopics = tableExists("curriculum_topics");
const hasConceptMastery = tableExists("concept_mastery");

for (const o of objectives) {
  const base = o.topic_name || o.domain_name;

  const concepts = db.prepare(`
    SELECT id, name, status
    FROM concepts
    WHERE status IN ('PENDING','VERIFIED','CANONICAL')
      AND (
        lower(name) LIKE lower(?)
        OR lower(name) LIKE lower(?)
        OR lower(description) LIKE lower(?)
      )
    LIMIT 20
  `).all(
    `%${base}%`,
    `%${o.domain_name}%`,
    `%${base}%`
  ) as any[];

  let topicId: string | null = null;

  if (hasCurriculumTopics && o.topic_name) {
    const topic = db.prepare(`
      SELECT id
      FROM curriculum_topics
      WHERE lower(name)=lower(?)
      LIMIT 1
    `).get(o.topic_name) as any;

    if (topic?.id) topicId = topic.id;
  }

  for (const c of concepts) {
    const r = db.prepare(`
      INSERT OR IGNORE INTO alai_v5_curriculum_impact_links
      (id, concept_id, concept_name, domain_name, topic_name, impact_type, confidence_score, created_at)
      VALUES (?, ?, ?, ?, ?, 'CURRICULUM_OBJECTIVE_IMPACT', 0.72, ?)
    `).run(
      crypto.randomUUID(),
      c.id,
      c.name,
      o.domain_name,
      o.topic_name || null,
      now
    );

    topicLinksCreated += r.changes;

    if (hasTopicConcepts && topicId) {
      try {
        const link = db.prepare(`
          INSERT OR IGNORE INTO topic_concepts
          (id, topic_id, concept_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(crypto.randomUUID(), topicId, c.id, now, now);

        topicLinksCreated += link.changes;
      } catch {
        try {
          const link = db.prepare(`
            INSERT OR IGNORE INTO topic_concepts
            (topic_id, concept_id)
            VALUES (?, ?)
          `).run(topicId, c.id);

          topicLinksCreated += link.changes;
        } catch {}
      }
    }

    if (hasConceptMastery) {
      const existing = db.prepare(`
        SELECT concept_id
        FROM concept_mastery
        WHERE concept_id=?
        LIMIT 1
      `).get(c.id) as any;

      if (!existing) {
        const cols = db.prepare(`PRAGMA table_info(concept_mastery)`).all() as any[];
        const names = new Set(cols.map((x) => x.name));

        if (names.has("concept_id") && names.has("mastery_score")) {
          try {
            db.prepare(`
              INSERT INTO concept_mastery
              (concept_id, mastery_score, created_at, updated_at)
              VALUES (?, 0.64, ?, ?)
            `).run(c.id, now, now);
            masteryRowsCreated++;
          } catch {}
        }
      } else {
        try {
          db.prepare(`
            UPDATE concept_mastery
            SET mastery_score=MAX(COALESCE(mastery_score,0),0.64),
                updated_at=?
            WHERE concept_id=?
          `).run(now, c.id);
          masteryRowsUpdated++;
        } catch {}
      }
    }
  }

  db.prepare(`
    UPDATE alai_v2_curriculum_full_study_queue
    SET status='IMPACTED',
        updated_at=?
    WHERE id=?
  `).run(now, o.id);
}

let coverageRecalculated = 0;

if (tableExists("curriculum_coverage")) {
  safeExec(`DELETE FROM curriculum_coverage WHERE 1=0;`);
}

if (tableExists("domain_coverage_rollup") && tableExists("academic_domains")) {
  const domains = db.prepare(`
    SELECT id, name
    FROM academic_domains
  `).all() as any[];

  for (const d of domains) {
    const linked = db.prepare(`
      SELECT COUNT(DISTINCT concept_id) AS n
      FROM alai_v5_curriculum_impact_links
      WHERE domain_name=?
    `).get(d.name) as any;

    const mastered = db.prepare(`
      SELECT COUNT(DISTINCT l.concept_id) AS n
      FROM alai_v5_curriculum_impact_links l
      LEFT JOIN concept_mastery cm ON cm.concept_id=l.concept_id
      WHERE l.domain_name=?
        AND COALESCE(cm.mastery_score,0) >= 0.6
    `).get(d.name) as any;

    const total = Number(linked?.n || 0);
    const done = Number(mastered?.n || 0);
    if (total <= 0) continue;

    const score = Math.min(1, Math.max(0, done / Math.max(1,total)));

    const existing = db.prepare(`
      SELECT id
      FROM domain_coverage_rollup
      WHERE domain_id=?
      LIMIT 1
    `).get(d.id) as any;

    if (existing) {
      db.prepare(`
        UPDATE domain_coverage_rollup
        SET rollup_coverage_score=MAX(rollup_coverage_score, ?),
            concepts_total=MAX(concepts_total, ?),
            concepts_mastered=MAX(concepts_mastered, ?),
            last_calculated_at=?,
            updated_at=?
        WHERE domain_id=?
      `).run(score, total, done, now, now, d.id);
      coverageRecalculated++;
    }
  }
}

db.prepare(`
UPDATE alai_v5_curriculum_impact_runs
SET finished_at=?,
    objectives_processed=?,
    topic_links_created=?,
    mastery_rows_created=?,
    mastery_rows_updated=?,
    coverage_recalculated=?,
    status='COMPLETED'
WHERE id=?
`).run(
  new Date().toISOString(),
  objectives.length,
  topicLinksCreated,
  masteryRowsCreated,
  masteryRowsUpdated,
  coverageRecalculated,
  runId
);

console.log("ALAI V5 curriculum impact engine completed.");
console.log({
  objectivesProcessed: objectives.length,
  topicLinksCreated,
  masteryRowsCreated,
  masteryRowsUpdated,
  coverageRecalculated
});

db.close();

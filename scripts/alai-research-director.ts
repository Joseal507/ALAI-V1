import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

type GapRow = {
  id: string;
  conceptId: string | null;
  topicId: string | null;
  conceptName: string | null;
  topicName: string | null;
  conceptStatus: string | null;
  gapDescription: string;
  priorityScore: number;
  evidenceCount: number;
  relationCount: number;
  masteryScore: number;
  linkedAnsweredQuestions: number;
  linkedOpenQuestions: number;
  linkedBlockedQuestions: number;
};

function ensureTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS alai_research_director_runs (
      id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      gaps_scanned INTEGER NOT NULL DEFAULT 0,
      questions_created INTEGER NOT NULL DEFAULT 0,
      gaps_closed INTEGER NOT NULL DEFAULT 0,
      gaps_blocked INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'RUNNING'
    );

    CREATE TABLE IF NOT EXISTS alai_research_gap_links (
      id TEXT PRIMARY KEY,
      gap_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(gap_id, question_id)
    );

    CREATE INDEX IF NOT EXISTS idx_research_gap_links_gap ON alai_research_gap_links(gap_id);
    CREATE INDEX IF NOT EXISTS idx_research_gap_links_question ON alai_research_gap_links(question_id);
  `);
}

function conceptIsTrusted(status: string | null): boolean {
  return status === "VERIFIED" || status === "CANONICAL";
}

function classifyQuestionType(description: string): string {
  const text = description.toLowerCase();

  if (text.includes("evidence") || text.includes("source")) return "EVIDENCE_GAP";
  if (text.includes("relation") || text.includes("prerequisite") || text.includes("dependency") || text.includes("application")) return "RELATION_GAP";
  if (text.includes("capabilit") || text.includes("testable") || text.includes("understanding goals")) return "CAPABILITY_GAP";
  if (text.includes("core concepts") || text.includes("curriculum topic")) return "TOPIC_CONCEPT_GAP";
  if (text.includes("prerequisite topics")) return "TOPIC_PREREQUISITE_GAP";

  return "MASTERY_GAP";
}

function extractTopicName(description: string): string | null {
  const match = description.match(/curriculum topic:\s*(.+?)\.?$/i);
  if (!match) return null;
  return match[1].trim().replace(/\.$/, "");
}

function buildQuestion(gap: GapRow, type: string): string {
  const target = gap.conceptName || gap.topicName || extractTopicName(gap.gapDescription) || "this curriculum gap";

  if (type === "EVIDENCE_GAP") {
    return `What reliable evidence is needed to strengthen ${target}?`;
  }

  if (type === "RELATION_GAP") {
    return `Which prerequisite, part-of, dependency, or application relations should ${target} have?`;
  }

  if (type === "CAPABILITY_GAP") {
    return `What capabilities should prove understanding of ${target}?`;
  }

  if (type === "TOPIC_CONCEPT_GAP" || type === "TOPIC_PREREQUISITE_GAP") {
    return gap.gapDescription;
  }

  return `What is missing for ${target} to move from weak knowledge to strong knowledge?`;
}

function shouldCloseGap(gap: GapRow): boolean {
  if (gap.linkedAnsweredQuestions > 0) return true;

  const text = gap.gapDescription.toLowerCase();

  if (text.includes("evidence") || text.includes("source")) {
    return gap.evidenceCount >= 3 && conceptIsTrusted(gap.conceptStatus);
  }

  if (text.includes("relation") || text.includes("prerequisite") || text.includes("dependency") || text.includes("application")) {
    return gap.relationCount >= 4;
  }

  if (text.includes("capabilit") || text.includes("testable") || text.includes("understanding goals")) {
    return gap.masteryScore >= 0.72 && conceptIsTrusted(gap.conceptStatus);
  }

  if (text.includes("curriculum topic")) {
    return gap.linkedAnsweredQuestions > 0;
  }

  return gap.evidenceCount >= 2 && gap.relationCount >= 2 && gap.masteryScore >= 0.65;
}

function shouldBlockGap(gap: GapRow): boolean {
  if (gap.linkedBlockedQuestions >= 3 && gap.linkedOpenQuestions === 0) return true;
  return false;
}

function questionExists(gap: GapRow, question: string, type: string): string | null {
  const existing = db.prepare(`
    SELECT id
    FROM alai_research_questions
    WHERE status IN ('OPEN','IN_PROGRESS','ANSWERED','BLOCKED')
      AND (
        lower(question) = lower(?)
        OR (
          concept_id IS NOT NULL
          AND concept_id = ?
          AND question_type = ?
        )
        OR (
          topic_id IS NOT NULL
          AND topic_id = ?
          AND question_type = ?
        )
      )
    ORDER BY
      CASE status
        WHEN 'ANSWERED' THEN 0
        WHEN 'OPEN' THEN 1
        WHEN 'IN_PROGRESS' THEN 2
        WHEN 'BLOCKED' THEN 3
        ELSE 4
      END
    LIMIT 1
  `).get(question, gap.conceptId, type, gap.topicId, type) as { id: string } | undefined;

  return existing?.id ?? null;
}

function linkGapQuestion(gapId: string, questionId: string) {
  db.prepare(`
    INSERT OR IGNORE INTO alai_research_gap_links (
      id,
      gap_id,
      question_id,
      created_at
    )
    VALUES (?, ?, ?, ?)
  `).run(crypto.randomUUID(), gapId, questionId, now);
}

function createQuestion(gap: GapRow): string | null {
  const type = classifyQuestionType(gap.gapDescription);
  const question = buildQuestion(gap, type);
  const existingId = questionExists(gap, question, type);

  if (existingId) {
    linkGapQuestion(gap.id, existingId);
    return null;
  }

  const id = crypto.randomUUID();

  db.prepare(`
    INSERT INTO alai_research_questions (
      id,
      concept_id,
      topic_id,
      question,
      question_type,
      priority_score,
      status,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)
  `).run(
    id,
    gap.conceptId,
    gap.topicId,
    question,
    type,
    Math.max(gap.priorityScore, 0.72),
    now,
    now
  );

  linkGapQuestion(gap.id, id);
  return id;
}

function main() {
  ensureTables();

  const runId = crypto.randomUUID();

  db.prepare(`
    INSERT INTO alai_research_director_runs (
      id,
      started_at,
      status
    )
    VALUES (?, ?, 'RUNNING')
  `).run(runId, now);

  const gaps = db.prepare(`
    SELECT
      kg.id,
      kg.concept_id AS conceptId,
      CASE
        WHEN kg.concept_id IS NULL
         AND lower(kg.gap_description) LIKE 'map core concepts for curriculum topic:%'
        THEN (
          SELECT ct.id
          FROM curriculum_topics ct
          WHERE lower(trim(replace(replace(kg.gap_description, 'Map core concepts for curriculum topic:', ''), '.', ''))) = lower(ct.name)
          LIMIT 1
        )
        ELSE NULL
      END AS topicId,
      c.name AS conceptName,
      CASE
        WHEN kg.concept_id IS NULL
         AND lower(kg.gap_description) LIKE 'map core concepts for curriculum topic:%'
        THEN (
          SELECT ct.name
          FROM curriculum_topics ct
          WHERE lower(trim(replace(replace(kg.gap_description, 'Map core concepts for curriculum topic:', ''), '.', ''))) = lower(ct.name)
          LIMIT 1
        )
        ELSE NULL
      END AS topicName,
      c.status AS conceptStatus,
      kg.gap_description AS gapDescription,
      kg.priority_score AS priorityScore,
      COALESCE(cm.mastery_score, 0) AS masteryScore,
      COUNT(DISTINCT cel.evidence_id) AS evidenceCount,
      COUNT(DISTINCT r.id) AS relationCount,
      COUNT(DISTINCT CASE WHEN q.status='ANSWERED' THEN q.id END) AS linkedAnsweredQuestions,
      COUNT(DISTINCT CASE WHEN q.status IN ('OPEN','IN_PROGRESS') THEN q.id END) AS linkedOpenQuestions,
      COUNT(DISTINCT CASE WHEN q.status='BLOCKED' THEN q.id END) AS linkedBlockedQuestions
    FROM knowledge_gaps kg
    LEFT JOIN concepts c ON c.id = kg.concept_id
    LEFT JOIN concept_mastery cm ON cm.concept_id = c.id
    LEFT JOIN concept_evidence_links cel ON cel.concept_id = c.id
    LEFT JOIN relations r ON r.from_concept_id = c.id OR r.to_concept_id = c.id
    LEFT JOIN alai_research_gap_links gl ON gl.gap_id = kg.id
    LEFT JOIN alai_research_questions q ON q.id = gl.question_id
    WHERE kg.status = 'OPEN'
      AND (
        c.id IS NULL
        OR c.status != 'REJECTED'
      )
    GROUP BY kg.id
    ORDER BY kg.priority_score DESC, kg.created_at ASC
    LIMIT 500
  `).all() as GapRow[];

  let questionsCreated = 0;
  let gapsClosed = 0;
  let gapsBlocked = 0;

  const closeGap = db.prepare(`
    UPDATE knowledge_gaps
    SET status='RESOLVED',
        updated_at=?
    WHERE id=?
  `);

  const blockGap = db.prepare(`
    UPDATE knowledge_gaps
    SET status='BLOCKED',
        updated_at=?
    WHERE id=?
  `);

  for (const gap of gaps) {
    if (shouldCloseGap(gap)) {
      closeGap.run(now, gap.id);
      gapsClosed++;
      continue;
    }

    if (shouldBlockGap(gap)) {
      blockGap.run(now, gap.id);
      gapsBlocked++;
      continue;
    }

    if (!gap.conceptId && !gap.topicId && gap.gapDescription.toLowerCase().includes("curriculum topic")) {
      blockGap.run(now, gap.id);
      gapsBlocked++;
      continue;
    }

    if (!gap.conceptId && !gap.topicId) {
      blockGap.run(now, gap.id);
      gapsBlocked++;
      continue;
    }

    const created = createQuestion(gap);
    if (created) questionsCreated++;
  }

  db.prepare(`
    UPDATE alai_research_director_runs
    SET finished_at=?,
        gaps_scanned=?,
        questions_created=?,
        gaps_closed=?,
        gaps_blocked=?,
        status='COMPLETED'
    WHERE id=?
  `).run(
    new Date().toISOString(),
    gaps.length,
    questionsCreated,
    gapsClosed,
    gapsBlocked,
    runId
  );

  console.log("ALAI Research Director completed.");
  console.log({
    gapsScanned: gaps.length,
    questionsCreated,
    gapsClosed,
    gapsBlocked,
  });

  console.table(db.prepare(`
    SELECT status, COUNT(*) AS count
    FROM knowledge_gaps
    GROUP BY status
  `).all());

  console.table(db.prepare(`
    SELECT status, COUNT(*) AS count
    FROM alai_research_questions
    GROUP BY status
  `).all());

  console.table(db.prepare(`
    SELECT
      q.question_type AS type,
      q.priority_score AS priority,
      q.status,
      COALESCE(c.name, t.name, 'Unknown') AS target
    FROM alai_research_questions q
    LEFT JOIN concepts c ON c.id = q.concept_id
    LEFT JOIN curriculum_topics t ON t.id = q.topic_id
    WHERE q.status='OPEN'
    ORDER BY q.priority_score DESC, q.updated_at ASC
    LIMIT 30
  `).all());
}

main();
db.close();

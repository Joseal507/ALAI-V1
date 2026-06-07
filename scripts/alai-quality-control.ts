import Database from "better-sqlite3";
import { rankConcept } from "../src/learning/concept-rank-engine";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_quality_flags (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  issue_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'MEDIUM',
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(target_type, target_id, issue_type)
);
`);

function upsertFlag(
  targetType: string,
  targetId: string,
  issueType: string,
  severity: string,
  message: string
) {
  db.prepare(`
    INSERT INTO alai_quality_flags (
      id, target_type, target_id, issue_type, severity, message, status, created_at, updated_at
    )
    VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, 'OPEN', ?, ?)
    ON CONFLICT(target_type, target_id, issue_type) DO UPDATE SET
      severity = excluded.severity,
      message = excluded.message,
      status = 'OPEN',
      updated_at = excluded.updated_at
  `).run(targetType, targetId, issueType, severity, message, now, now);
}

function tableExists(name: string) {
  const row = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name = ?
    LIMIT 1
  `).get(name);

  return Boolean(row);
}

let duplicateQuestionsDeleted = 0;

if (tableExists("alai_self_questions")) {
  const duplicateGroups = db.prepare(`
    SELECT
      COALESCE(topic_id, '') AS topicKey,
      COALESCE(concept_id, '') AS conceptKey,
      question,
      COUNT(*) AS count
    FROM alai_self_questions
    GROUP BY COALESCE(topic_id, ''), COALESCE(concept_id, ''), question
    HAVING COUNT(*) > 1
  `).all() as {
    topicKey: string;
    conceptKey: string;
    question: string;
    count: number;
  }[];

  const deleteDuplicateGroup = db.transaction((topicKey: string, conceptKey: string, question: string) => {
    const rows = db.prepare(`
      SELECT
        q.id,
        q.status,
        q.priority_score,
        q.created_at,
        CASE
          WHEN EXISTS (
            SELECT 1 FROM alai_question_answers a
            WHERE a.question_id = q.id
          ) THEN 1
          ELSE 0
        END AS hasAnswer
      FROM alai_self_questions q
      WHERE COALESCE(q.topic_id, '') = ?
        AND COALESCE(q.concept_id, '') = ?
        AND q.question = ?
      ORDER BY
        hasAnswer DESC,
        CASE q.status WHEN 'ANSWERED' THEN 1 ELSE 0 END DESC,
        q.priority_score DESC,
        q.created_at ASC
    `).all(topicKey, conceptKey, question) as {
      id: string;
      status: string;
      priority_score: number;
      created_at: string;
      hasAnswer: number;
    }[];

    const keep = rows[0];
    const remove = rows.slice(1);

    for (const row of remove) {
      if (tableExists("alai_question_answers")) {
        db.prepare(`DELETE FROM alai_question_answers WHERE question_id = ?`).run(row.id);
      }

      db.prepare(`DELETE FROM alai_self_questions WHERE id = ?`).run(row.id);
      duplicateQuestionsDeleted++;
    }

    if (keep) {
      upsertFlag(
        "QUESTION",
        keep.id,
        "DUPLICATE_QUESTION_GROUP_CLEANED",
        "LOW",
        `Removed ${remove.length} duplicate copies of this question.`
      );
    }
  });

  for (const group of duplicateGroups) {
    deleteDuplicateGroup(group.topicKey, group.conceptKey, group.question);
  }
}

const concepts = db.prepare(`
  SELECT id, name, description, status
  FROM concepts
`).all() as {
  id: string;
  name: string;
  description: string;
  status: string;
}[];

let conceptsAudited = 0;
let conceptsFlagged = 0;
let conceptsQuarantined = 0;

const auditConcept = db.transaction((concept: {
  id: string;
  name: string;
  description: string;
  status: string;
}) => {
  conceptsAudited++;

  const topicLinks = db.prepare(`
    SELECT COUNT(*) AS count
    FROM topic_concepts
    WHERE concept_id = ?
  `).get(concept.id) as { count: number };

  const relationLinks = db.prepare(`
    SELECT COUNT(*) AS count
    FROM relations
    WHERE from_concept_id = ?
       OR to_concept_id = ?
  `).get(concept.id, concept.id) as { count: number };

  const directEvidence = tableExists("concept_evidence")
    ? db.prepare(`
        SELECT COUNT(*) AS count
        FROM concept_evidence
        WHERE concept_id = ?
      `).get(concept.id) as { count: number }
    : { count: 0 };

  const linkedEvidence = tableExists("concept_evidence_links")
    ? db.prepare(`
        SELECT COUNT(*) AS count
        FROM concept_evidence_links
        WHERE concept_id = ?
      `).get(concept.id) as { count: number }
    : { count: 0 };

  const externalEvidence = tableExists("concept_evidence_links")
    ? db.prepare(`
        SELECT COUNT(*) AS count
        FROM concept_evidence_links cel
        JOIN evidence e ON e.id = cel.evidence_id
        WHERE cel.concept_id = ?
          AND upper(COALESCE(e.source_type, '')) NOT IN ('INTERNAL', 'AI_INTERNAL', 'SELF_GENERATED')
      `).get(concept.id) as { count: number }
    : { count: 0 };

  const totalEvidence = directEvidence.count + linkedEvidence.count;
  const rank = rankConcept(concept.name, concept.description);

  if (rank === "NOISE") {
    upsertFlag(
      "CONCEPT",
      concept.id,
      "NOISE_CONCEPT",
      "HIGH",
      `Concept "${concept.name}" was ranked as noise.`
    );
    conceptsFlagged++;
  }

  if (topicLinks.count === 0) {
    upsertFlag(
      "CONCEPT",
      concept.id,
      "ORPHAN_CONCEPT",
      "MEDIUM",
      `Concept "${concept.name}" is not linked to any curriculum topic.`
    );
    conceptsFlagged++;
  }

  if (totalEvidence === 0) {
    upsertFlag(
      "CONCEPT",
      concept.id,
      "NO_EVIDENCE",
      "MEDIUM",
      `Concept "${concept.name}" has no evidence links.`
    );
    conceptsFlagged++;
  }

  const isExternallySupported = externalEvidence.count > 0;

  if (concept.status === "VERIFIED" && !isExternallySupported) {
    upsertFlag(
      "CONCEPT",
      concept.id,
      "VERIFIED_WITHOUT_EXTERNAL_EVIDENCE",
      "HIGH",
      `Concept "${concept.name}" is verified but has no external evidence link. It was returned to PENDING until externally supported.`
    );
    conceptsFlagged++;

    db.prepare(`
      UPDATE concepts
      SET status = 'PENDING',
          updated_at = ?
      WHERE id = ?
        AND status = 'VERIFIED'
    `).run(now, concept.id);

    conceptsQuarantined++;
  }

  if (
    rank === "NOISE" &&
    topicLinks.count === 0 &&
    relationLinks.count === 0 &&
    totalEvidence === 0
  ) {
    db.prepare(`DELETE FROM concepts WHERE id = ?`).run(concept.id);
    conceptsQuarantined++;
  }
});

for (const concept of concepts) {
  auditConcept(concept);
}

console.log("ALAI quality control completed.");
console.log({
  duplicateQuestionsDeleted,
  conceptsAudited,
  conceptsFlagged,
  conceptsQuarantined,
});

console.table(db.prepare(`
  SELECT issue_type AS issue, severity, COUNT(*) AS count
  FROM alai_quality_flags
  WHERE status = 'OPEN'
  GROUP BY issue_type, severity
  ORDER BY
    CASE severity
      WHEN 'HIGH' THEN 1
      WHEN 'MEDIUM' THEN 2
      WHEN 'LOW' THEN 3
      ELSE 4
    END,
    count DESC
`).all());

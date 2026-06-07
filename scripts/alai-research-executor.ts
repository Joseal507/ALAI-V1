import Database from "better-sqlite3";
import crypto from "node:crypto";
import { researchWeb } from "../src/research/research-engine";
import { learnKnowledgeFromEvidenceText } from "../src/autonomy/autonomous-knowledge-learner";
import { evaluateAutonomousLearningTarget } from "../src/autonomy/governance-brain";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

type QuestionRow = {
  id: string;
  conceptId: string | null;
  topicId: string | null;
  conceptName: string | null;
  topicName: string | null;
  question: string;
  questionType: string;
  priority: number;
};

function buildSearchQuery(row: QuestionRow): string {
  const target = row.conceptName ?? row.topicName ?? row.question;

  if (row.questionType === "EVIDENCE_GAP") {
    return `${target} reliable educational explanation basics`;
  }

  if (row.questionType === "RELATION_GAP") {
    return `${target} prerequisites related concepts educational basics`;
  }

  if (row.questionType === "MASTERY_GAP") {
    return `${target} common misconceptions examples explanation`;
  }

  if (row.questionType === "CAPABILITY_GAP") {
    return `${target} learning objectives skills assessment`;
  }

  if (row.questionType === "TOPIC_CONCEPT_GAP") {
    return `${target} core concepts curriculum basics`;
  }

  if (row.questionType === "TOPIC_PREREQUISITE_GAP") {
    return `${target} prerequisite topics curriculum`;
  }

  return `${target} educational basics`;
}

function linkEvidenceToConcept(evidenceId: string, conceptId: string | null) {
  if (!conceptId) return;

  db.prepare(`
    INSERT OR IGNORE INTO concept_evidence_links (
      evidence_id,
      concept_id,
      confidence_score,
      created_at
    )
    VALUES (?, ?, 0.58, ?)
  `).run(evidenceId, conceptId, now);
}

function saveEvidence(row: QuestionRow, source: { title: string; url: string; snippet: string }) {
  const existing = db.prepare(`
    SELECT id
    FROM evidence
    WHERE source_url = ?
    LIMIT 1
  `).get(source.url) as { id: string } | undefined;

  if (existing) {
    linkEvidenceToConcept(existing.id, row.conceptId);
    return { inserted: false, evidenceId: existing.id };
  }

  const evidenceId = crypto.randomUUID();

  db.prepare(`
    INSERT INTO evidence (
      id,
      source_type,
      source_name,
      source_url,
      content_summary,
      reliability_score,
      captured_at
    )
    VALUES (?, 'WEBSITE_RESEARCH', ?, ?, ?, 0.55, ?)
  `).run(
    evidenceId,
    source.title,
    source.url,
    source.snippet,
    now
  );

  linkEvidenceToConcept(evidenceId, row.conceptId);

  return { inserted: true, evidenceId };
}

async function main() {
  const questions = db.prepare(`
    SELECT
      q.id,
      q.concept_id AS conceptId,
      q.topic_id AS topicId,
      c.name AS conceptName,
      t.name AS topicName,
      q.question,
      q.question_type AS questionType,
      q.priority_score AS priority
    FROM alai_research_questions q
    LEFT JOIN concepts c ON c.id = q.concept_id
    LEFT JOIN curriculum_topics t ON t.id = q.topic_id
    WHERE q.status = 'OPEN'
      AND (
        c.id IS NULL
        OR c.status != 'REJECTED'
      )
    ORDER BY q.priority_score DESC, q.created_at ASC
    LIMIT 20
  `).all() as QuestionRow[];

  if (questions.length === 0) {
    console.log("No open research questions found.");
    return;
  }

  let processed = 0;
  let evidenceInserted = 0;
  let evidenceLinked = 0;
  let questionsAnswered = 0;
  const results: {
    target: string;
    type: string;
    query: string;
    sources: number;
    inserted: number;
    linked: number;
  }[] = [];

  for (const question of questions) {
    const target = question.conceptName ?? question.topicName ?? "Unknown";
    const governance = evaluateAutonomousLearningTarget({
      name: target,
      description: question.question,
    });

    if (!governance.allowed) {
      db.prepare(`
        UPDATE alai_research_questions
        SET status = 'REJECTED',
            updated_at = ?
        WHERE id = ?
      `).run(now, question.id);

      console.warn("Rejected research question by governance:", {
        target,
        reason: governance.reason,
        score: governance.score,
      });

      processed++;
      results.push({
        target,
        type: question.questionType,
        query: "REJECTED_BY_GOVERNANCE",
        sources: 0,
        inserted: 0,
        linked: 0,
      });

      continue;
    }

    const searchQuery = buildSearchQuery(question);

    db.prepare(`
      UPDATE alai_research_questions
      SET status = 'IN_PROGRESS',
          updated_at = ?
      WHERE id = ?
    `).run(now, question.id);

    const research = await researchWeb(searchQuery);
    const sources = research.sources.slice(0, 3);

    let insertedForQuestion = 0;
    let linkedForQuestion = 0;

    for (const source of sources) {
      const saved = saveEvidence(question, source);

      if (saved.inserted) {
        evidenceInserted++;
        insertedForQuestion++;
      } else {
        evidenceLinked++;
        linkedForQuestion++;
      }
    }

    const learningText = sources
      .map((source) => `${source.title}\n${source.snippet}`)
      .join("\n\n");

    if (learningText.trim().length > 0) {
      await learnKnowledgeFromEvidenceText(db, learningText);
    }

    const nextStatus = sources.length > 0 ? "ANSWERED" : "OPEN";

    db.prepare(`
      UPDATE alai_research_questions
      SET status = ?,
          updated_at = ?
      WHERE id = ?
    `).run(nextStatus, now, question.id);

    if (nextStatus === "ANSWERED") questionsAnswered++;

    processed++;

    results.push({
      target,
      type: question.questionType,
      query: searchQuery,
      sources: sources.length,
      inserted: insertedForQuestion,
      linked: linkedForQuestion,
    });
  }

  console.log("ALAI research executor completed.");
  console.log({
    processed,
    questionsAnswered,
    evidenceInserted,
    evidenceLinked,
  });

  console.table(results);
}

main().catch((error) => {
  console.error("ALAI research executor failed:");
  console.error(error);
  process.exit(1);
});

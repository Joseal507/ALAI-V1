import Database from "better-sqlite3";
import crypto from "node:crypto";
import { getPrioritizedOpenGaps } from "../src/autonomy/gap-prioritizer";
import { createLearningTaskFromGap } from "../src/autonomy/learning-planner";
import { researchWeb } from "../src/research/research-engine";
import { learnKnowledgeFromEvidenceText } from "../src/autonomy/autonomous-knowledge-learner";
import { getActiveLearningDomain } from "../src/learning/education-progression";

function buildSchoolQuery(topicName: string, domainName: string): string {
  const topic = topicName.trim();

  if (domainName === "Foundational Learning") {
    return `${topic} preschool early childhood education basics`;
  }

  if (domainName === "Primary Foundations") {
    return `${topic} elementary education basics`;
  }

  if (domainName === "Algebra") {
    return `${topic} middle school algebra basics`;
  }

  if (domainName === "Mathematics") {
    return `${topic} school mathematics basics`;
  }

  return `${topic} educational basics`;
}

async function main() {
  const db = new Database("data/alai.db");
  const now = new Date().toISOString();

  console.log("\n=== ALAI Autonomous Learning v2 ===");

  const activeDomain = getActiveLearningDomain(db);

  const activeObjective = db.prepare(`
    SELECT
      o.id AS objectiveId,
      o.title,
      o.attempts,
      t.id AS topicId,
      t.name AS topicName,
      d.name AS domainName
    FROM alai_learning_objectives o
    JOIN curriculum_topics t ON t.id = o.topic_id
    JOIN academic_domains d ON d.id = t.domain_id
    WHERE o.status IN ('OPEN', 'IN_PROGRESS')
      AND d.name = ?
    ORDER BY o.priority_score DESC, o.attempts ASC, o.updated_at ASC
    LIMIT 1
  `).get(activeDomain.domainName) as {
    objectiveId: string;
    title: string;
    attempts: number;
    topicId: string;
    topicName: string;
    domainName: string;
  } | undefined;

  let objective = "";
  let searchQuery = "";

  if (activeObjective) {
    objective = `${activeObjective.topicName}: Find reliable external evidence for the active school objective "${activeObjective.title}".`;
    searchQuery = buildSchoolQuery(activeObjective.topicName, activeObjective.domainName);

    db.prepare(`
      UPDATE alai_learning_objectives
      SET status = 'IN_PROGRESS',
          attempts = attempts + 1,
          updated_at = ?
      WHERE id = ?
    `).run(now, activeObjective.objectiveId);
  } else {
    const [gap] = getPrioritizedOpenGaps(db, 1);

    if (!gap) {
      console.log("No active objective or open gap found.");
      process.exit(0);
    }

    const task = createLearningTaskFromGap(gap);
    objective = task.objective;
    searchQuery = task.searchQuery;
  }

  console.log("Active domain:");
  console.log(activeDomain);

  console.log("\nLearning objective:");
  console.log(objective);

  console.log("\nSearch query:");
  console.log(searchQuery);

  const research = await researchWeb(searchQuery);

  let inserted = 0;
  let skipped = 0;

  for (const source of research.sources.slice(0, 3)) {
    const existing = db.prepare(`
      SELECT id
      FROM evidence
      WHERE source_url = ?
      LIMIT 1
    `).get(source.url) as { id: string } | undefined;

    if (existing) {
      skipped++;
      continue;
    }

    db.prepare(`
      INSERT INTO evidence (
        id,
        source_type,
        source_name,
        source_url,
        content_summary,
        reliability_score,
        captured_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      "WEBSITE",
      source.title,
      source.url,
      source.snippet,
      0.55,
      now
    );

    inserted++;
  }

  const learningText = research.sources
    .slice(0, 3)
    .map((source) => `${source.title}\n${source.snippet}`)
    .join("\n\n");

  const learned = await learnKnowledgeFromEvidenceText(db, learningText);

  console.log("\nEvidence saved:");
  console.log({ inserted, skipped });

  console.log("\nKnowledge learned:");
  console.log(learned);
}

main().catch((error) => {
  console.error("Autonomous learning failed:");
  console.error(error);
  process.exit(1);
});

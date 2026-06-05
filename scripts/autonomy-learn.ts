import Database from "better-sqlite3";
import crypto from "node:crypto";
import { getPrioritizedOpenGaps } from "../src/autonomy/gap-prioritizer";
import { createLearningTaskFromGap } from "../src/autonomy/learning-planner";
import { buildResearchQuery } from "../src/research/research-query-builder";
import { researchWeb } from "../src/research/research-engine";
import { learnKnowledgeFromEvidenceText } from "../src/autonomy/autonomous-knowledge-learner";

async function main() {
  const db = new Database("data/alai.db");

  const [gap] = getPrioritizedOpenGaps(db, 1);

  console.log("\n=== ALAI Autonomous Learning v1 ===");

  if (!gap) {
    console.log("No open gaps found.");
    process.exit(0);
  }

  const task = createLearningTaskFromGap(gap);

  const queryPlan = task.lockSearchQuery
    ? {
        searchQuery: task.searchQuery,
        reason: task.reason,
      }
    : await buildResearchQuery(task.searchQuery);

  const research = await researchWeb(queryPlan.searchQuery);
  const now = new Date().toISOString();

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

  console.log("Learning objective:");
  console.log(task.objective);

  console.log("\nSearch query:");
  console.log(queryPlan.searchQuery);

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

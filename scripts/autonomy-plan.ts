import Database from "better-sqlite3";
import { getPrioritizedOpenGaps } from "../src/autonomy/gap-prioritizer";
import { createLearningTaskFromGap } from "../src/autonomy/learning-planner";
import { buildResearchQuery } from "../src/research/research-query-builder";

async function main() {
  const db = new Database("data/alai.db");

  const gaps = getPrioritizedOpenGaps(db, 5);

  console.log("\n=== ALAI Autonomous Learning Plan ===");

  if (gaps.length === 0) {
    console.log("No open gaps found.");
    process.exit(0);
  }

  const tasks = [];

  for (const gap of gaps) {
    const task = createLearningTaskFromGap(gap);
    const queryPlan = task.lockSearchQuery
      ? {
          searchQuery: task.searchQuery,
          reason: task.reason,
        }
      : await buildResearchQuery(task.searchQuery);

    tasks.push({
      gapId: task.gapId,
      objective: task.objective,
      searchQuery: queryPlan.searchQuery,
      reason: queryPlan.reason,
      locked: task.lockSearchQuery,
    });
  }

  console.table(tasks);
}

main().catch((error) => {
  console.error("Autonomy plan failed:");
  console.error(error);
  process.exit(1);
});

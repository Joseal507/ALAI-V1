import Database from "better-sqlite3";
import { getPrioritizedOpenGaps } from "../src/autonomy/gap-prioritizer";
import { createLearningTaskFromGap } from "../src/autonomy/learning-planner";
import { buildResearchQuery } from "../src/research/research-query-builder";
import { researchWeb } from "../src/research/research-engine";

async function main() {
  const db = new Database("data/alai.db");

  const [gap] = getPrioritizedOpenGaps(db, 1);

  console.log("\n=== ALAI Autonomous Learning Run v1 ===");

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

  console.log("\nLearning objective:");
  console.log(task.objective);

  console.log("\nOptimized search query:");
  console.log(queryPlan.searchQuery);

  console.log("\nResearch sources:");
  console.table(research.sources);
}

main().catch((error) => {
  console.error("Autonomous learning run failed:");
  console.error(error);
  process.exit(1);
});

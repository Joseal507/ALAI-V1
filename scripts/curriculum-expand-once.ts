import Database from "better-sqlite3";
import {
  expandCurriculumObjective,
  getNextCurriculumObjective,
  markCurriculumObjective,
} from "../src/autonomy/curriculum-expansion-engine";

async function main() {
  const db = new Database("data/alai.db");

  const next = getNextCurriculumObjective(db);

  console.log("\n=== ALAI Curriculum Expansion Once ===");

  if (!next) {
    console.log("No open curriculum expansion objectives.");
    return;
  }

  console.log("\nObjective:");
  console.log(next.objective);

  try {
    const result = await expandCurriculumObjective(db, next.objective);
    markCurriculumObjective(db, next.id, "DONE");

    console.log("\nExpansion summary:");
    console.log(result.expansion.summary);

    console.log("\nInserted / linked:");
    console.log({
      domainsInsertedOrFound: result.domainsInsertedOrFound,
      topicsInsertedOrFound: result.topicsInsertedOrFound,
      conceptsLinked: result.conceptsLinked,
      prerequisitesLinked: result.prerequisitesLinked,
      queued: result.queued,
    });

    console.log("\nItems:");
    console.table(
      result.expansion.items.map((item) => ({
        kind: item.kind,
        name: item.name,
        prerequisites: item.prerequisites.length,
        coreConcepts: item.coreConcepts.length,
        next: item.nextExpansionObjectives.length,
      }))
    );
  } catch (error) {
    markCurriculumObjective(db, next.id, "FAILED");
    throw error;
  }
}

main().catch((error) => {
  console.error("Curriculum expansion failed:");
  console.error(error);
  process.exit(1);
});

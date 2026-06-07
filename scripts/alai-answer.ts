import { runAlaiUnifiedBrain } from "../src/alai/alai-unified-brain";

const input = process.argv.slice(2).join(" ").trim();

if (!input) {
  console.error('Usage: npm run alai:answer -- "What is a vector?"');
  process.exit(1);
}

async function main() {
  const result = await runAlaiUnifiedBrain(input);

  console.log("\n=== ALAI Answer ===");
  console.log(result.answer);
  console.log("");
  console.log("Mode:", result.mode);
  console.log("Confidence:", result.confidence.toFixed(3));

  if (result.sources.length > 0) {
    console.log("Sources:", result.sources.join(", "));
  }

  if (result.trace.length > 0) {
    console.log("");
    console.log("Trace:");
    for (const step of result.trace) {
      console.log(`- ${step.brain}: ${step.action} -> ${step.result}`);
    }
  }
}

main().catch((error) => {
  console.error("ALAI answer failed:");
  console.error(error);
  process.exit(1);
});

import { runConsensus } from "../src/consensus/consensus-engine";

async function main() {
  const question = process.argv.slice(2).join(" ").trim();

  if (!question) {
    console.error('Usage: npm run consensus:test -- "question"');
    process.exit(1);
  }

  const result = await runConsensus(question);

  console.log("\n=== ALAI Consensus Result ===");
  console.log("Question:", result.question);
  console.log("Confidence:", result.confidence);

  console.log("\nProviders:");
  for (const response of result.responses) {
    console.log("-", response.provider);
  }

  console.log("\nSynthesis:");
  console.log(result.synthesis);
}

main().catch((error) => {
  console.error("Consensus test failed:");
  console.error(error);
  process.exit(1);
});

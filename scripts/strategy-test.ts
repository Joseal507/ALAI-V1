import { analyzeIntentWithAI } from "../src/core/ai-intent-analyzer";
import { decideStrategyFromAIAnalysis } from "../src/core/strategy-engine";

async function main() {
  const input = process.argv.slice(2).join(" ").trim();

  if (!input) {
    console.error('Usage: npm run strategy:test -- "your question"');
    process.exit(1);
  }

  const analysis = await analyzeIntentWithAI(input);
  const decision = decideStrategyFromAIAnalysis(analysis);

  console.log("\n=== ALAI AI Intent Analysis ===");
  console.log(JSON.stringify(decision, null, 2));
}

main().catch((error) => {
  console.error("Strategy test failed:");
  console.error(error);
  process.exit(1);
});

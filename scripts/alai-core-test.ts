import { runAlaiCore } from "../src/alai/alai-core-orchestrator";

const input = process.argv.slice(2).join(" ").trim();

if (!input) {
  console.error('Usage: npm run alai:core -- "What is a vector?"');
  process.exit(1);
}

const result = runAlaiCore(input);

console.log("\n=== ALAI Core Response ===");
console.log(JSON.stringify(result, null, 2));

import { decideStrategyFallback } from "../src/core/strategy-engine";

const input = process.argv.slice(2).join(" ").trim();

if (!input) {
  console.error('Usage: npm run strategy:test -- "your question"');
  process.exit(1);
}

const decision = decideStrategyFallback(input);

console.log("\n=== ALAI Strategy Decision ===");
console.log(JSON.stringify(decision, null, 2));

import { runAlaiUnifiedBrain } from "../src/alai/alai-unified-brain";

const questions = [
  "que relacion tiene vector con linear algebra",
  "compara vector y scalar",
  "que relacion tiene probability con statistics",
  "compara mean y median",
  "que relacion tiene artificial general intelligence con artificial intelligence",
  "para que sirve probability",
  "explica machine learning de forma simple",
];

function hasBadSignals(answer: string): string[] {
  const signals: string[] = [];

  if (/Reasoning from ALAI's graph/i.test(answer)) signals.push("EXPOSED_GRAPH_REASONING");
  if (/Internal confidence/i.test(answer)) signals.push("ENGLISH_CONFIDENCE_LABEL");
  if (/Mode:|Trace:|answerPlan|INTERNAL_REASONING/i.test(answer)) signals.push("IMPLEMENTATION_LEAK");
  if (/\b(is|are|was|were|used to|through|within|related to|type of)\b/.test(answer)) {
    signals.push("POSSIBLE_ENGLISH_LEAK");
  }
  if (answer.trim().length < 40) signals.push("TOO_SHORT");
  if (answer.includes("ALAI entiende")) signals.push("MECHANICAL_SELF_REFERENCE");

  return signals;
}

async function main() {
  const results = [];

  for (const question of questions) {
    const response = await runAlaiUnifiedBrain(question);
    const badSignals = hasBadSignals(response.answer);

    results.push({
      question,
      mode: response.mode,
      confidence: response.confidence,
      ok:
        response.mode === "INTERNAL_REASONING" &&
        response.confidence >= 0.55 &&
        badSignals.length === 0,
      badSignals: badSignals.join(", ") || "none",
      answer: response.answer.replace(/\n/g, " ").slice(0, 220),
    });
  }

  console.table(results);
}

main().catch((error) => {
  console.error("ALAI cognitive generalization test failed:");
  console.error(error);
  process.exit(1);
});

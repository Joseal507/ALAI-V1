import { analyzeIntentWithAI } from "../src/core/ai-intent-analyzer";
import { decideStrategyFromAIAnalysis } from "../src/core/strategy-engine";
import { studyAI } from "../src/providers/study-ai-provider";

async function main() {
  const input = process.argv.slice(2).join(" ").trim();

  if (!input) {
    console.error('Usage: npm run alai -- "your question"');
    process.exit(1);
  }

  const analysis = await analyzeIntentWithAI(input);
  const decision = decideStrategyFromAIAnalysis(analysis);

  console.log("\n=== ALAI Strategy ===");
  console.log(JSON.stringify(decision, null, 2));

  const answer = await studyAI({
    messages: [
      {
        role: "system",
        content: `
You are ALAI, an academic AI assistant.

Answer the user according to this strategy:

${JSON.stringify(decision, null, 2)}

Rules:
- Be useful.
- Do not mention internal JSON unless necessary.
- If the strategy says research is needed, clearly say this requires current research.
- If the question is stable academic knowledge, answer clearly.
- Adapt tone and depth to the user's request.
        `.trim(),
      },
      {
        role: "user",
        content: input,
      },
    ],
    temperature: 0.4,
    maxTokens: 900,
  });

  console.log("\n=== ALAI Answer ===");
  console.log(`Provider: ${answer.provider}`);
  console.log(answer.text);
}

main().catch((error) => {
  console.error("ALAI failed:");
  console.error(error);
  process.exit(1);
});

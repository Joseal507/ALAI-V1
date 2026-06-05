import "dotenv/config";
import { studyAI } from "../src/providers/study-ai-provider";

async function main() {
  const input = process.argv.slice(2).join(" ").trim();

  if (!input) {
    console.error('Usage: npm run ai:test -- "message"');
    process.exit(1);
  }

  const result = await studyAI({
    messages: [
      {
        role: "system",
        content: "You are ALAI. Answer clearly and briefly.",
      },
      {
        role: "user",
        content: input,
      },
    ],
    temperature: 0.3,
    maxTokens: 500,
  });

  console.log("\n=== ALAI AI Test ===");
  console.log(`Provider: ${result.provider}`);
  console.log(result.text);
}

main().catch((error) => {
  console.error("AI test failed:");
  console.error(error);
  process.exit(1);
});

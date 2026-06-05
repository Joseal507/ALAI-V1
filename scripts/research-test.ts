import { researchWeb } from "../src/research/research-engine";

async function main() {
  const query = process.argv.slice(2).join(" ").trim();

  if (!query) {
    console.error('Usage: npm run research:test -- "query"');
    process.exit(1);
  }

  const result = await researchWeb(query);

  console.log("\n=== ALAI Research Result ===");
  console.log("Query:", result.query);
  console.table(result.sources);
}

main().catch((error) => {
  console.error("Research test failed:");
  console.error(error);
  process.exit(1);
});

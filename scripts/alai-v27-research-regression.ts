import { researchWeb } from "../src/research/research-engine";

async function main() {
  const tests = [
    "Celula Madre Pluripotente educational basics",
    "messi educational basics",
    "Compara ADN ARN educational basics",
    "Álgebra lineal educational basics",
    "que es la fotosintesis educational basics"
  ];

  let passed = 0;

  for (const q of tests) {
    console.log(`\n===== RESEARCH TEST: ${q} =====`);
    const r = await researchWeb(q);
    console.log({
      query: r.query,
      sources: r.sources.length,
      titles: r.sources.map(s => s.title)
    });

    if (r.sources.length > 0) passed++;
  }

  console.log({ passed, total: tests.length });
  if (passed < tests.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import { spawnSync } from "node:child_process";

const tests = [
  "porque una celula es importante en medicina",
  "explica como una mutacion puede afectar una proteina",
  "que relacion existe entre vectores y algebra lineal",
  "que es una celula madre pluripotente",
  "quien es messi"
];

let passed = 0;

for (const q of tests) {
  console.log(`\n===== V18 DEMAND TEST: ${q} =====`);

  const r = spawnSync("npm", ["run", "alai:v18-answer", "--", q], {
    encoding: "utf8",
    timeout: 300000
  });

  console.log(r.stdout);

  const out = `${r.stdout}\n${r.stderr}`.toLowerCase();

  const ok =
    r.status === 0 &&
    !out.includes("error:") &&
    !out.includes("no such table") &&
    !out.includes("referenceerror") &&
    !out.includes("typeerror");

  console.log({ ok });

  if (ok) passed++;
}

const allPassed = passed >= 4;

console.log("\n=== ALAI V18 DEMAND PIPELINE REGRESSION ===");
console.log({ passed, total: tests.length, allPassed });

if (!allPassed) process.exit(1);

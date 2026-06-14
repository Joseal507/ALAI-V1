import { spawnSync } from "node:child_process";

const tests = [
  "porque una celula es importante en medicina",
  "que relacion existe entre vectores y algebra lineal",
  "que es una celula madre pluripotente",
  "quien es messi"
];

let passed = 0;

for (const q of tests) {
  console.log(`\n===== V20 CLOSURE TEST: ${q} =====`);

  const r = spawnSync("npm", ["run", "alai:v20-answer", "--", q], {
    encoding: "utf8",
    timeout: 420000
  });

  const out = `${r.stdout}\n${r.stderr}`.toLowerCase();
  console.log(r.stdout);

  const ok =
    r.status === 0 &&
    !out.includes("referenceerror") &&
    !out.includes("typeerror") &&
    !out.includes("no such table") &&
    !out.includes("error:");

  console.log({ ok });

  if (ok) passed++;
}

const allPassed = passed === tests.length;

console.log("\n=== ALAI V20 CLOSURE REGRESSION ===");
console.log({ passed, total: tests.length, allPassed });

if (!allPassed) process.exit(1);

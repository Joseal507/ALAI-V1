import { spawnSync } from "node:child_process";

const tests = [
  "que es una celula",
  "que relacion existe entre vectores y algebra lineal",
  "compara mitosis y meiosis",
  "porque messi es mejor que cristiano ronaldo",
  "explica como una mutacion puede afectar una proteina"
];

let passed = 0;

for (const q of tests) {
  console.log(`\n===== V14 TEST: ${q} =====`);

  const r = spawnSync("npm", ["run", "alai:v14-answer", "--", q], {
    encoding: "utf8",
    timeout: 180000
  });

  console.log(r.stdout);

  const out = `${r.stdout}\n${r.stderr}`.toLowerCase();
  const ok =
    r.status === 0 &&
    !out.includes("selectednodes: []") &&
    !out.includes("cannot") &&
    !out.includes("error:");

  console.log({ ok });

  if (ok) passed++;
}

const allPassed = passed >= 4;

console.log("\n=== ALAI V14 ON-DEMAND REGRESSION ===");
console.log({ passed, total: tests.length, allPassed });

if (!allPassed) process.exit(1);

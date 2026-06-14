import { spawnSync } from "node:child_process";

const tests = [
  "porque una celula es importante en medicina",
  "que relacion existe entre vectores y algebra lineal",
  "que es una celula madre pluripotente",
  "quien es messi"
];

let passed = 0;

for (const q of tests) {
  console.log(`\n===== FAST INTEGRITY TEST: ${q} =====`);

  const r = spawnSync("npm", ["run", "alai:v21-answer", "--", q], {
    encoding: "utf8",
    timeout: 90000
  });

  const out = `${r.stdout}\n${r.stderr}`.toLowerCase();
  console.log(r.stdout);

  const noCrash =
    !out.includes("referenceerror") &&
    !out.includes("typeerror") &&
    !out.includes("no such table");

  if (noCrash) passed++;
}

console.log({ passed, total: tests.length });

if (passed < tests.length) process.exit(1);

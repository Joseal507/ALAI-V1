import { spawnSync } from "node:child_process";

const tests = [
  "porque una celula es importante en medicina",
  "que relacion existe entre vectores y algebra lineal",
  "que es una celula madre pluripotente",
  "quien es messi"
];

let passed = 0;

for (const q of tests) {
  console.log(`\n===== ${q} =====`);

  const r = spawnSync(
    "npm",
    ["run","alai:v21-answer","--",q],
    {
      encoding:"utf8",
      timeout:420000
    }
  );

  console.log(r.stdout);

  const out = (
    r.stdout +
    r.stderr
  ).toLowerCase();

  const ok =
    !out.includes("referenceerror") &&
    !out.includes("typeerror") &&
    !out.includes("no such table");

  if (ok) passed++;
}

console.log({
  passed,
  total: tests.length
});

if (passed < tests.length)
  process.exit(1);

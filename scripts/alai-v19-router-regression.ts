import { spawnSync } from "node:child_process";

const tests = [
  {
    q: "porque una celula es importante en medicina",
    must: ["Célula", "Medicina"],
    bad: []
  },
  {
    q: "que relacion existe entre vectores y algebra lineal",
    must: ["Vector", "Álgebra lineal"],
    bad: ["Célula → Tejido"]
  },
  {
    q: "que es una celula madre pluripotente",
    must: ["researchTriggered"],
    bad: ["Célula → Tejido → Órgano → Enfermedad"]
  },
  {
    q: "quien es messi",
    must: ["researchTriggered"],
    bad: ["Célula → Tejido", "Medicina", "Órgano"]
  }
];

let passed = 0;

for (const t of tests) {
  console.log(`\n===== V19 ROUTER TEST: ${t.q} =====`);

  const r = spawnSync("npm", ["run", "alai:v19-answer", "--", t.q], {
    encoding: "utf8",
    timeout: 300000
  });

  const raw = `${r.stdout}\n${r.stderr}`;
  const out = raw.toLowerCase();

  console.log(r.stdout);

  const hasMust = t.must.every(x => out.includes(x.toLowerCase()));
  const hasBad = t.bad.some(x => out.includes(x.toLowerCase()));
  const ok = r.status === 0 && hasMust && !hasBad;

  console.log({ ok, hasMust, hasBad });

  if (ok) passed++;
}

const allPassed = passed === tests.length;

console.log("\n=== ALAI V19 ROUTER REGRESSION ===");
console.log({ passed, total: tests.length, allPassed });

if (!allPassed) process.exit(1);

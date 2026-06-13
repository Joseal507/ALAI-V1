import { spawnSync } from "node:child_process";

const tests = [
  {
    q: "explica como la fotosintesis produce oxigeno",
    must: ["fotosintesis", "oxygen"],
    bad: ["ox", "mathematics", "labor animal"]
  },
  {
    q: "explica una ecuacion lineal",
    must: ["linear equation"],
    bad: ["infant development", "observational learning"]
  },
  {
    q: "explicame como aprende una red neuronal",
    must: ["neural network"],
    bad: ["red-blue", "green-red", "basic colors"]
  },
  {
    q: "explica como estan conectados ADN, ARN y proteinas",
    must: ["dna", "rna", "protein"],
    bad: ["animal", "compatibilidad"]
  },
  {
    q: "explica como la energia del sol termina llegando a los animales",
    must: ["solar energy", "fotosintesis", "food chain", "animal"],
    bad: ["infant development", "observational learning"]
  }
];

let passed = 0;

for (const t of tests) {
  console.log(`\n===== TEST: ${t.q} =====`);

  const r = spawnSync(
    "npm",
    ["run", "alai:v7-answer", "--", t.q],
    { encoding: "utf8" }
  );

  const out = `${r.stdout}\n${r.stderr}`.toLowerCase();
  console.log(r.stdout);

  const hasMust = t.must.every(x => out.includes(x.toLowerCase()));
  const hasBad = t.bad.some(x => out.includes(x.toLowerCase()));

  const ok = r.status === 0 && hasMust && !hasBad;

  console.log({ ok, hasMust, hasBad });

  if (ok) passed++;
}

const allPassed = passed === tests.length;
console.log("\n=== ALAI V8 CHAT QUALITY REGRESSION ===");
console.log({ passed, total: tests.length, allPassed });

if (!allPassed) process.exit(1);

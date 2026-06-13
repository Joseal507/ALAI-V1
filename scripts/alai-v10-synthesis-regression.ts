import { spawnSync } from "node:child_process";

const tests = [
  {
    q: "explica como la fotosintesis produce oxigeno",
    must: ["fotosíntesis", "oxígeno", "libera"],
    bad: ["ox:", "buey", "labor animal", "ear"]
  },
  {
    q: "explica una ecuacion lineal",
    must: ["ecuación lineal", "variable", "potencia 1"],
    bad: ["infant development", "observational learning", "ear"]
  },
  {
    q: "explicame como aprende una red neuronal",
    must: ["red neuronal", "datos", "pesos", "error"],
    bad: ["red-blue", "basic colors", "green-red"]
  },
  {
    q: "explica como estan conectados ADN, ARN y proteinas",
    must: ["ADN", "ARN", "proteínas", "información genética"],
    bad: ["alternate set", "internal consolidation"]
  },
  {
    q: "explica como la energia del sol termina llegando a los animales",
    must: ["Sol", "fotosíntesis", "plantas", "animales", "cadena alimenticia"],
    bad: ["infant development", "observational learning"]
  }
];

let passed = 0;

for (const t of tests) {
  console.log(`\n===== V10 TEST: ${t.q} =====`);
  const r = spawnSync("npm", ["run", "alai:v10-answer", "--", t.q], { encoding: "utf8" });
  const outRaw = `${r.stdout}\n${r.stderr}`;
  const out = outRaw.toLowerCase();

  console.log(r.stdout);

  const hasMust = t.must.every(x => out.includes(x.toLowerCase()));
  const hasBad = t.bad.some(x => out.includes(x.toLowerCase()));
  const ok = r.status === 0 && hasMust && !hasBad;

  console.log({ ok, hasMust, hasBad });

  if (ok) passed++;
}

const allPassed = passed === tests.length;

console.log("\n=== ALAI V10 SYNTHESIS REGRESSION ===");
console.log({ passed, total: tests.length, allPassed });

if (!allPassed) process.exit(1);

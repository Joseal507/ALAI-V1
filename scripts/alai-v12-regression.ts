import { spawnSync } from "node:child_process";

const tests = [
  {
    q: "explica como la fotosintesis produce oxigeno",
    must: ["subgrafo", "fotosíntesis", "agua", "dióxido de carbono", "oxígeno"],
    bad: ["ox:", "buey", "ear", "infant"]
  },
  {
    q: "explica una ecuacion lineal",
    must: ["subgrafo", "ecuación lineal", "variable", "pendiente", "línea recta"],
    bad: ["ear", "infant", "observational"]
  },
  {
    q: "explicame como aprende una red neuronal",
    must: ["subgrafo", "red neuronal", "datos de entrenamiento", "pesos", "error"],
    bad: ["red-blue", "green-red", "basic colors"]
  },
  {
    q: "explica como estan conectados ADN, ARN y proteinas",
    must: ["subgrafo", "adn", "arn", "proteínas", "genes"],
    bad: ["alternate set", "internal consolidation", "nocturnal"]
  },
  {
    q: "explica como la energia del sol termina llegando a los animales",
    must: ["subgrafo", "luz solar", "fotosíntesis", "productores", "consumidores", "animales"],
    bad: ["infant", "observational"]
  }
];

let passed = 0;

for (const t of tests) {
  console.log(`\n===== V12 TEST: ${t.q} =====`);

  const r = spawnSync("npm", ["run", "alai:v12-answer", "--", t.q], {
    encoding: "utf8"
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

console.log("\n=== ALAI V12 GRAPH GROUNDED REGRESSION ===");
console.log({ passed, total: tests.length, allPassed });

if (!allPassed) process.exit(1);

import { spawnSync } from "node:child_process";

const tests = [
  {
    q: "explica como la fotosintesis produce oxigeno",
    must: ["fotosíntesis", "oxígeno", "agua", "co₂"],
    bad: ["ox:", "buey", "labor animal", "ear"]
  },
  {
    q: "explica una ecuacion lineal",
    must: ["ecuación lineal", "potencia 1", "líneas rectas"],
    bad: ["infant development", "observational learning", "ear"]
  },
  {
    q: "explicame como aprende una red neuronal",
    must: ["red neuronal", "pesos", "datos de entrenamiento", "error"],
    bad: ["red-blue", "basic colors", "green-red", "neuron reasoning tests"]
  },
  {
    q: "explica como estan conectados ADN, ARN y proteinas",
    must: ["adn", "arn", "proteínas", "adn → arn → proteína"],
    bad: ["alternate set", "internal consolidation", "nocturnal"]
  },
  {
    q: "explica como la energia del sol termina llegando a los animales",
    must: ["sol", "fotosíntesis", "plantas", "herbívoros", "carnívoros"],
    bad: ["infant development", "observational learning"]
  }
];

let passed = 0;

for (const t of tests) {
  console.log(`\n===== V11 TEST: ${t.q} =====`);

  const r = spawnSync("npm", ["run", "alai:v11-answer", "--", t.q], {
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

console.log("\n=== ALAI V11 SEMANTIC RELEVANCE COURT REGRESSION ===");
console.log({ passed, total: tests.length, allPassed });

if (!allPassed) process.exit(1);

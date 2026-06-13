import { spawnSync } from "node:child_process";

const tests = [
  {
    q: "explica como la fotosintesis produce oxigeno",
    must: ["En resumen", "fotosíntesis", "oxígeno", "libera"],
    bad: ["ALAI construyó", "Relaciones que usó", "subgrafo", "ox:"]
  },
  {
    q: "explica una ecuacion lineal",
    must: ["En resumen", "ecuación lineal", "cambio constante", "línea recta"],
    bad: ["ALAI construyó", "Relaciones que usó", "subgrafo", "ear"]
  },
  {
    q: "explicame como aprende una red neuronal",
    must: ["En resumen", "red neuronal", "pesos", "error", "predicciones"],
    bad: ["ALAI construyó", "Relaciones que usó", "subgrafo", "red-blue"]
  },
  {
    q: "explica como estan conectados ADN, ARN y proteinas",
    must: ["En resumen", "ADN", "ARN", "proteínas", "información genética"],
    bad: ["ALAI construyó", "Relaciones que usó", "subgrafo", "alternate"]
  },
  {
    q: "explica como la energia del sol termina llegando a los animales",
    must: ["En resumen", "Sol", "productores", "fotosíntesis", "animales"],
    bad: ["ALAI construyó", "Relaciones que usó", "subgrafo", "infant"]
  }
];

let passed = 0;

for (const t of tests) {
  console.log(`\n===== V13 TEST: ${t.q} =====`);

  const r = spawnSync("npm", ["run", "alai:v13-answer", "--", t.q], {
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

console.log("\n=== ALAI V13 LANGUAGE EXPRESSION REGRESSION ===");
console.log({ passed, total: tests.length, allPassed });

if (!allPassed) process.exit(1);

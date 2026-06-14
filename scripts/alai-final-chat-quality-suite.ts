import { spawnSync } from "node:child_process";

const tests = [
  {
    q: "que es una celula",
    must: ["célula", "unidad básica", "seres vivos"],
    bad: ["no encontró suficiente", "provisional"]
  },
  {
    q: "que relacion existe entre vectores y algebra lineal",
    must: ["vectores", "álgebra lineal", "matrices"],
    bad: ["no encontró suficiente", "provisional"]
  },
  {
    q: "compara mitosis y meiosis",
    must: ["mitosis", "meiosis", "cromosomas"],
    bad: ["no encontró suficiente", "provisional"]
  },
  {
    q: "porque messi es mejor que cristiano ronaldo",
    must: ["messi", "cristiano", "depende del criterio"],
    bad: ["no encontró suficiente", "provisional"]
  },
  {
    q: "explica como una mutacion puede afectar una proteina",
    must: ["mutación", "adn", "arn", "proteína", "función celular"],
    bad: ["no encontró suficiente", "provisional", "ALAI usa las relaciones anteriores"]
  },
  {
    q: "explica como aprende una red neuronal",
    must: ["red neuronal", "pesos", "error", "predicciones"],
    bad: ["red-blue", "basic colors"]
  },
  {
    q: "explica como la energia del sol llega a los animales",
    must: ["sol", "fotosíntesis", "animales"],
    bad: ["infant", "observational"]
  },
  {
    q: "explica como estan conectados ADN ARN y proteinas",
    must: ["adn", "arn", "proteínas", "información genética"],
    bad: ["alternate", "nocturnal"]
  }
];

let passed = 0;

for (const t of tests) {
  console.log(`\\n===== FINAL QUALITY TEST: ${t.q} =====`);

  const r = spawnSync("npm", ["run", "alai:v14-answer", "--", t.q], {
    encoding: "utf8",
    timeout: 180000
  });

  const raw = `${r.stdout}\\n${r.stderr}`;
  const out = raw.toLowerCase();

  console.log(r.stdout);

  const hasMust = t.must.every(x => out.includes(x.toLowerCase()));
  const hasBad = t.bad.some(x => out.includes(x.toLowerCase()));
  const ok = r.status === 0 && hasMust && !hasBad;

  console.log({ ok, hasMust, hasBad });

  if (ok) passed++;
}

const allPassed = passed === tests.length;

console.log("\\n=== ALAI FINAL CHAT QUALITY SUITE ===");
console.log({ passed, total: tests.length, allPassed });

if (!allPassed) process.exit(1);

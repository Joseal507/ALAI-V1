import { spawnSync } from "node:child_process";

const tests = [
  {
    q: "que es una celula",
    must: ["célula", "unidad básica", "seres vivos"],
    bad: ["no tengo suficientes", "provisional"]
  },
  {
    q: "porque es importante estudiar las celulas",
    must: ["células", "importante", "enfermedades"],
    bad: ["no tengo suficientes", "provisional"]
  },
  {
    q: "porque una celula es la unidad basica de la vida",
    must: ["unidad básica", "funciones vitales", "vida"],
    bad: ["no tengo suficientes", "provisional"]
  },
  {
    q: "porque es importante saber que es una celula en medicina",
    must: ["medicina", "enfermedades", "célula"],
    bad: ["no tengo suficientes", "provisional"]
  },
  {
    q: "que relacion existe entre vectores y algebra lineal",
    must: ["vectores", "álgebra lineal", "matrices"],
    bad: ["no tengo suficientes", "provisional"]
  },
  {
    q: "explica como una mutacion puede afectar una proteina",
    must: ["mutación", "adn", "arn", "proteína", "función celular"],
    bad: ["ALAI usa las relaciones anteriores", "provisional"]
  },
  {
    q: "compara ADN y ARN",
    must: ["adn", "arn", "instrucciones"],
    bad: ["provisional"]
  },
  {
    q: "porque messi es mejor que cristiano ronaldo",
    must: ["messi", "cristiano", "depende del criterio"],
    bad: ["provisional"]
  }
];

let passed = 0;

for (const t of tests) {
  console.log(`\n===== V15 PRIORITY TEST: ${t.q} =====`);

  const r = spawnSync("npm", ["run", "alai:v15-answer", "--", t.q], {
    encoding: "utf8",
    timeout: 180000
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

console.log("\n=== ALAI V15 PRIORITY QUESTION REGRESSION ===");
console.log({ passed, total: tests.length, allPassed });

if (!allPassed) process.exit(1);

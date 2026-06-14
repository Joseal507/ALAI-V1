import { spawnSync } from "node:child_process";

const tests = [
  {
    q: "porque una celula es importante en medicina",
    must: ["células importan en medicina", "tejidos", "órganos", "diagnóstico", "tratamiento"],
    bad: ["se relaciona con medicina porque existe una cadena"]
  },
  {
    q: "porque una celula es la unidad basica de la vida",
    must: ["unidad básica de la vida", "funciones", "tejidos", "órganos"],
    bad: ["se relaciona con medicina porque existe una cadena"]
  },
  {
    q: "explica como una mutacion puede afectar una proteina",
    must: ["mutación", "proteína", "información genética", "estructura o función"],
    bad: ["se relaciona con proteína porque existe una cadena"]
  },
  {
    q: "que relacion existe entre vectores y algebra lineal",
    must: ["vectores", "álgebra lineal", "objetos centrales", "transformaciones"],
    bad: ["se relaciona con álgebra lineal porque existe una cadena"]
  }
];

let passed = 0;

for (const t of tests) {
  console.log(`\n===== V17 LANGUAGE TEST: ${t.q} =====`);

  const r = spawnSync("npm", ["run", "alai:v17-answer", "--", t.q], {
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

console.log("\n=== ALAI V17 LANGUAGE REALIZER REGRESSION ===");
console.log({ passed, total: tests.length, allPassed });

if (!allPassed) process.exit(1);

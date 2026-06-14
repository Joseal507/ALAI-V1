import { spawnSync } from "node:child_process";

const tests = [
  {
    q: "porque una celula es importante en medicina",
    must: ["Célula → Tejido", "Órgano", "Enfermedad", "Diagnóstico", "Medicina"],
    bad: ["no tengo suficientes", "provisional"]
  },
  {
    q: "porque una celula es la unidad basica de la vida",
    must: ["célula", "tejidos", "órganos"],
    bad: ["no tengo suficientes", "provisional"]
  },
  {
    q: "explica como una mutacion puede afectar una proteina",
    must: ["Mutación → ADN", "Gen", "ARN", "Proteína"],
    bad: ["ALAI usa las relaciones anteriores", "provisional"]
  },
  {
    q: "que relacion existe entre vectores y algebra lineal",
    must: ["Vector → Álgebra lineal", "matrices", "sistemas"],
    bad: ["no tengo suficientes", "provisional"]
  }
];

let passed = 0;

for (const t of tests) {
  console.log(`\n===== V16 GRAPH TEST: ${t.q} =====`);

  const r = spawnSync("npm", ["run", "alai:v16-answer", "--", t.q], {
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

console.log("\n=== ALAI V16 GRAPH REASONING REGRESSION ===");
console.log({ passed, total: tests.length, allPassed });

if (!allPassed) process.exit(1);

import { spawnSync } from "node:child_process";

const tests = [
  {
    q: "que es una celula",
    must: ["célula", "unidad básica", "seres vivos"],
    bad: ["provisional", "no encontró suficiente"]
  },
  {
    q: "que relacion existe entre vectores y algebra lineal",
    must: ["vectores", "álgebra lineal", "matrices"],
    bad: ["provisional", "no encontró suficiente"]
  },
  {
    q: "compara mitosis y meiosis",
    must: ["mitosis", "meiosis", "cromosomas"],
    bad: ["provisional", "no encontró suficiente"]
  },
  {
    q: "porque messi es mejor que cristiano ronaldo",
    must: ["messi", "cristiano", "depende del criterio"],
    bad: ["provisional", "no encontró suficiente"]
  },
  {
    q: "explica como una mutacion puede afectar una proteina",
    must: ["mutación", "adn", "proteína"],
    bad: ["provisional", "no encontró suficiente"]
  }
];

let passed = 0;

for (const t of tests) {
  console.log(`\n===== REAL TIME TEST: ${t.q} =====`);

  const r = spawnSync("npm", ["run", "alai:v14-answer", "--", t.q], {
    encoding: "utf8",
    timeout: 180000
  });

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

console.log("\n=== ALAI V14 REAL TIME ANSWER REGRESSION ===");
console.log({ passed, total: tests.length, allPassed });

if (!allPassed) process.exit(1);

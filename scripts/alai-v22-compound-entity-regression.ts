import { spawnSync } from "node:child_process";

const tests = [
  {
    q: "que es una celula madre pluripotente",
    must: ["Pluripotente"],
    bad: ["Célula se conecta con Medicina", "unidad básica de los seres vivos"]
  },
  {
    q: "compara ADN y ARN",
    must: ["ADN"],
    bad: ["Célula se conecta con Medicina"]
  },
  {
    q: "que relacion existe entre vectores y algebra lineal",
    must: ["Vector"],
    bad: ["Célula se conecta con Medicina"]
  }
];

let passed = 0;

for (const t of tests) {
  console.log(`\n===== V22 COMPOUND ENTITY TEST: ${t.q} =====`);
  const r = spawnSync("npm", ["run", "alai:v19-answer", "--", t.q], {
    encoding: "utf8",
    timeout: 240000
  });

  const out = `${r.stdout || ""}\n${r.stderr || ""}`;
  console.log(out);

  const hasMust = t.must.some(m => out.toLowerCase().includes(m.toLowerCase()));
  const hasBad = t.bad.some(b => out.toLowerCase().includes(b.toLowerCase()));

  if (r.status === 0 && hasMust && !hasBad) {
    passed++;
  } else {
    console.error({ ok: false, hasMust, hasBad, status: r.status });
  }
}

console.log({ passed, total: tests.length });

if (passed < tests.length) process.exit(1);

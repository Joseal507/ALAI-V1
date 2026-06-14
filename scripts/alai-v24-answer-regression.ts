import { spawnSync } from "node:child_process";

const tests = [
  {
    q: "que es una celula madre pluripotente",
    must: ["pluripotente", "diferenciarse", "totipotencia"],
    bad: ["Célula se conecta con Medicina", "unidad básica de los seres vivos"]
  },
  {
    q: "compara ADN y ARN",
    must: ["ADN", "ARN", "uracilo"],
    bad: ["ALAI detectó un concepto específico", "Célula se conecta con Medicina"]
  },
  {
    q: "quien es messi",
    must: ["Messi", "futbolista", "Argentina"],
    bad: ["Célula se conecta con Medicina", "unidad básica de los seres vivos"]
  }
];

let passed = 0;

for (const t of tests) {
  console.log(`\n===== V24 ANSWER TEST: ${t.q} =====`);
  const r = spawnSync("npm", ["run", "alai:v19-answer", "--", t.q], {
    encoding: "utf8",
    timeout: 240000
  });

  const out = `${r.stdout || ""}\n${r.stderr || ""}`;
  console.log(out);

  const lower = out.toLowerCase();
  const hasMust = t.must.every(m => lower.includes(m.toLowerCase()));
  const hasBad = t.bad.some(b => lower.includes(b.toLowerCase()));

  if (r.status === 0 && hasMust && !hasBad) passed++;
  else console.error({ ok: false, status: r.status, hasMust, hasBad });
}

console.log({ passed, total: tests.length });
if (passed < tests.length) process.exit(1);

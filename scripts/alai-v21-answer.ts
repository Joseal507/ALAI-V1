import Database from "better-sqlite3";
import { spawnSync } from "node:child_process";

const db = new Database("data/alai.db");

const question = process.argv.slice(2).join(" ").trim();

if (!question) process.exit(1);

const answerRun = spawnSync(
  "npm",
  ["run","alai:v20-answer","--",question],
  {
    encoding:"utf8",
    timeout:420000
  }
);

const guard = spawnSync(
  "npm",
  ["run","alai:v21-guard","--",question],
  {
    encoding:"utf8",
    timeout:120000
  }
);

if (guard.status === 0) {
  console.log(answerRun.stdout);
  process.exit(0);
}

console.log("\n=== ALAI V21 INTEGRITY BLOCK ===\n");

console.log(
`ALAI detectó que la respuesta encontrada no coincide suficientemente con la pregunta.

La pregunta fue enviada a investigación prioritaria para evitar respuestas incorrectas.

Pregunta:
${question}`
);

try {
  db.prepare(`
    UPDATE alai_research_questions
    SET priority_score = 1.0
    WHERE status='OPEN'
  `).run();
} catch {}

process.exit(1);

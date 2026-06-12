import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");

const question = process.argv.slice(2).join(" ").trim();

if (!question) {
  console.error("usage: npm run alai:answer-synthesis -- \"question\"");
  process.exit(1);
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function terms(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter(x => x.length >= 3);
}

const concepts = db.prepare(`
SELECT
name,
status,
confidence_score
FROM concepts
WHERE status IN ('CANONICAL','VERIFIED')
`).all() as any[];

const qTerms = terms(question);

const ranked = concepts.map(c => {
  const nameTerms = terms(c.name);

  let score = 0;

  for (const q of qTerms) {
    if (nameTerms.includes(q)) score += 100;
    else if (c.name.toLowerCase().includes(q)) score += 30;
  }

  return {
    ...c,
    score
  };
})
.filter(c => c.score > 0)
.sort((a,b)=>b.score-a.score)
.slice(0,5);

const beliefs = db.prepare(`
SELECT belief,status,confidence_score
FROM alai_beliefs
ORDER BY confidence_score DESC
LIMIT 100
`).all() as any[];

const relations = db.prepare(`
SELECT
c1.name as fromName,
relation_type,
c2.name as toName
FROM relations r
JOIN concepts c1 ON c1.id=r.from_concept_id
JOIN concepts c2 ON c2.id=r.to_concept_id
LIMIT 5000
`).all() as any[];

const main = ranked[0];

let explanation: string[] = [];

if (main) {
  explanation.push(
    `${main.name} es un concepto que ALAI considera ${main.status.toLowerCase()}.`
  );

  const rel = relations
    .filter(r =>
      r.fromName === main.name ||
      r.toName === main.name
    )
    .slice(0,6);

  if (rel.length > 0) {
    explanation.push("");
    explanation.push("Relaciones importantes:");

    for (const r of rel) {
      explanation.push(
        `- ${r.fromName} ${r.relation_type} ${r.toName}`
      );
    }
  }

  const relatedBeliefs = beliefs
    .filter(b =>
      normalize(b.belief).includes(normalize(main.name))
    )
    .slice(0,3);

  if (relatedBeliefs.length > 0) {
    explanation.push("");
    explanation.push("Creencias respaldadas:");

    for (const b of relatedBeliefs) {
      explanation.push(
        `- ${b.belief} (confianza ${Number(b.confidence_score).toFixed(2)})`
      );
    }
  }

  explanation.push("");
  explanation.push(
    `Respuesta sintetizada: ${main.name} debe explicarse usando definición, relaciones, evidencia disponible y aplicaciones relacionadas.`
  );
} else {
  explanation.push(
    "ALAI no encontró suficiente conocimiento estructurado para responder con alta confianza."
  );
}

db.exec(`
CREATE TABLE IF NOT EXISTS alai_answer_synthesis_runs (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  concepts_used INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
`);

db.prepare(`
INSERT INTO alai_answer_synthesis_runs
(id,question,concepts_used,created_at)
VALUES (?,?,?,?)
`).run(
  crypto.randomUUID(),
  question,
  ranked.length,
  new Date().toISOString()
);

console.log("\n=== ALAI ANSWER SYNTHESIS BRAIN ===\n");
console.log({
  question,
  conceptsUsed: ranked.map(x=>x.name)
});

console.log("");
console.log(explanation.join("\n"));

db.close();

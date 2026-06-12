import Database from "better-sqlite3";

const db = new Database("data/alai.db");

const traces = db.prepare(`
SELECT id, public_reasoning, conclusion
FROM alai_reasoning_traces
`).all() as any[];

let removed = 0;

for (const t of traces) {
  const txt =
    `${t.public_reasoning} ${t.conclusion}`.toLowerCase();

  const nonsense =
    txt.includes("aquatic locomotion") &&
    txt.includes("machine learning");

  if (!nonsense) continue;

  db.prepare(`
  DELETE FROM alai_reasoning_traces
  WHERE id=?
  `).run(t.id);

  removed++;
}

console.log({
  removedHallucinatedReasoningChains: removed
});

db.close();

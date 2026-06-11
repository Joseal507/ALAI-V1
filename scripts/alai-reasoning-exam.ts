import Database from "better-sqlite3";
import crypto from "node:crypto";
import { reasonAboutQuestion } from "../src/reasoning/question-reasoner";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS alai_reasoning_exams (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  paths INTEGER NOT NULL,
  score REAL NOT NULL,
  created_at TEXT NOT NULL
);
`);

const pairs = db.prepare(`
  SELECT
    a.name AS fromName,
    b.name AS toName,
    COUNT(r.id) AS relationCount
  FROM relations r
  JOIN concepts a ON a.id = r.from_concept_id
  JOIN concepts b ON b.id = r.to_concept_id
  WHERE a.status != 'REJECTED'
    AND b.status != 'REJECTED'
    AND length(a.name) BETWEEN 3 AND 60
    AND length(b.name) BETWEEN 3 AND 60
  GROUP BY a.name, b.name
  ORDER BY relationCount DESC, a.name ASC
  LIMIT 40
`).all() as { fromName: string; toName: string; relationCount: number }[];

const questions = pairs.map((p) => `How does ${p.fromName} relate to ${p.toName}?`);

let written = 0;
let passed = 0;

const insert = db.prepare(`
  INSERT INTO alai_reasoning_exams (
    id, question, paths, score, created_at
  ) VALUES (?, ?, ?, ?, ?)
`);

for (const q of questions) {
  const start = Date.now();

  try {
    const r = reasonAboutQuestion(db, q);
    const paths = r.reasoningPaths.length;
    const score = paths > 0
      ? Math.max(...r.reasoningPaths.map((p) => p.confidenceScore))
      : 0;

    insert.run(
      crypto.randomUUID(),
      q,
      paths,
      Number(score.toFixed(3)),
      now
    );

    written++;
    if (score >= 0.55 && paths > 0) passed++;

    console.log({
      question: q,
      paths,
      score: Number(score.toFixed(3)),
      ms: Date.now() - start,
    });
  } catch (error: any) {
    console.warn("Reasoning exam failed:", q, String(error?.message || error));
  }
}

console.log("ALAI reasoning exam completed.");
console.log({ questions: questions.length, written, passed });

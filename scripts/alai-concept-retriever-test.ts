import Database from "better-sqlite3";
import { retrieveBestAlaiConcept } from "../src/alai/alai-concept-retriever";

const db = new Database("data/alai.db");

const cases = [
  "suma",
  "la suma",
  "fotosintesis",
  "fotosíntesis",
  "photosynthesis",
  "vector",
  "vectores",
  "joseal@AL-MacBook-Air alai-brain %",
  "confianza 0.950",
];

for (const item of cases) {
  const result = retrieveBestAlaiConcept(db, item);
  console.log(JSON.stringify({
    input: item,
    found: result.found,
    score: result.score,
    reason: result.reason,
    concept: result.concept?.name,
    status: result.concept?.status,
    mastery: result.concept?.masteryLevel,
  }, null, 2));
}

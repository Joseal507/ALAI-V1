import { guardAlaiInput } from "../src/alai/alai-input-guard";

const cases = [
  "que es fotosintesis",
  "dime la suma de una manera mas tecnica",
  "joseal@AL-MacBook-Air alai-brain %",
  "npm run alai:chat",
  "> tsx scripts/alai-chat.ts",
  "Modo: MASTER_BRAIN_RESEARCH_ANSWER",
  "Confianza: 0.300",
  "Trace:",
  "StudyAI: groq OK",
  "Rejected relation: Invalid relation type: AFFECTS",
  "SqliteError: table concepts has no column named concept_type",
  "at Database.prepare (/x/y/z.js:1:2)",
  ">",
];

for (const item of cases) {
  const result = guardAlaiInput(item);
  console.log(JSON.stringify({ input: item, result }, null, 2));
}

import Database from "better-sqlite3";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

const rows = db.prepare(`
SELECT
concept_id,
competency_score
FROM alai_concept_competencies
`).all() as {
  concept_id:string;
  competency_score:number;
}[];

const update = db.prepare(`
UPDATE alai_concept_competencies
SET status=?,
    updated_at=?
WHERE concept_id=?
`);

let competent = 0;
let developing = 0;
let weak = 0;

for (const row of rows) {

  let status =
    row.competency_score >= 0.72
      ? "COMPETENT"
      : row.competency_score >= 0.48
        ? "DEVELOPING"
        : "WEAK";

  update.run(
    status,
    now,
    row.concept_id
  );

  if(status==="COMPETENT") competent++;
  else if(status==="DEVELOPING") developing++;
  else weak++;
}

console.log({
  competent,
  developing,
  weak
});

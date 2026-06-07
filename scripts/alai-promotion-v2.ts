import Database from "better-sqlite3";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

const rows = db.prepare(`
  SELECT
    c.id,
    c.name,
    c.status,
    COUNT(DISTINCT cel.evidence_id) AS evidence,
    COUNT(DISTINCT r.id) AS relations,
    COALESCE(MAX(g.passed),0) AS grounded,
    COALESCE(MAX(a.passed),0) AS autonomous,
    COALESCE(cm.mastery_score,0) AS mastery
  FROM concepts c
  LEFT JOIN concept_evidence_links cel ON cel.concept_id = c.id
  LEFT JOIN relations r ON r.from_concept_id = c.id OR r.to_concept_id = c.id
  LEFT JOIN alai_evidence_grounded_exams g ON g.concept_id = c.id
  LEFT JOIN alai_autonomous_exams a ON a.concept_id = c.id
  LEFT JOIN concept_mastery cm ON cm.concept_id = c.id
  WHERE c.status = 'PENDING'
  GROUP BY c.id
`).all() as any[];

const promote = db.prepare(`
  UPDATE concepts
  SET status='VERIFIED',
      confidence_score=?,
      uncertainty_score=?,
      updated_at=?
  WHERE id=?
`);

const mastery = db.prepare(`
  UPDATE concept_mastery
  SET mastery_score=?,
      mastery_level=?,
      evidence_count=?,
      relation_count=?,
      updated_at=?,
      last_calculated_at=?
  WHERE concept_id=?
`);

let promoted = 0;

for (const r of rows) {
  const pass =
    r.evidence >= 5 &&
    r.relations >= 2 &&
    r.grounded >= 1 &&
    r.autonomous >= 1 &&
    r.mastery >= 0.58;

  if (!pass) continue;

  const score = r.evidence >= 10 && r.relations >= 4 ? 0.84 : 0.82;

  promote.run(score, +(1 - score).toFixed(3), now, r.id);
  mastery.run(score, "MASTERED", r.evidence, r.relations, now, now, r.id);

  promoted++;
  console.log("PROMOTED_V2:", r.name, {
    evidence: r.evidence,
    relations: r.relations,
    grounded: r.grounded,
    autonomous: r.autonomous,
    previousMastery: r.mastery,
    score,
  });
}

console.log("ALAI promotion V2 completed.");
console.log({ promoted });

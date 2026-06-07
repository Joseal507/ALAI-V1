import Database from "better-sqlite3";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

const candidates = db.prepare(`
  SELECT
    c.id,
    c.name,
    c.status,
    COUNT(DISTINCT cel.evidence_id) AS evidence,
    COUNT(DISTINCT r.id) AS relations,
    COALESCE(MAX(g.passed),0) AS grounded,
    COALESCE(MAX(a.passed),0) AS autonomous,
    COALESCE(MAX(st.passed),0) AS selfTest,
    COALESCE(cm.mastery_score,0) AS mastery
  FROM concepts c
  LEFT JOIN concept_evidence_links cel ON cel.concept_id = c.id
  LEFT JOIN relations r
    ON r.from_concept_id = c.id
    OR r.to_concept_id = c.id
  LEFT JOIN alai_evidence_grounded_exams g ON g.concept_id = c.id
  LEFT JOIN alai_autonomous_exams a ON a.concept_id = c.id
  LEFT JOIN alai_concept_self_tests st ON st.concept_id = c.id
  LEFT JOIN concept_mastery cm ON cm.concept_id = c.id
  WHERE c.status = 'PENDING'
  GROUP BY c.id
  HAVING evidence >= 5
     AND relations >= 2
     AND grounded >= 1
     AND autonomous >= 1
     AND mastery >= 0.50
`).all() as {
  id: string;
  name: string;
  evidence: number;
  relations: number;
  grounded: number;
  autonomous: number;
  selfTest: number;
  mastery: number;
}[];

const promote = db.prepare(`
  UPDATE concepts
  SET status = 'VERIFIED',
      confidence_score = MAX(confidence_score, ?),
      uncertainty_score = MIN(uncertainty_score, ?),
      updated_at = ?
  WHERE id = ?
`);

const updateMastery = db.prepare(`
  UPDATE concept_mastery
  SET mastery_score = MAX(mastery_score, ?),
      mastery_level = CASE
        WHEN MAX(mastery_score, ?) >= 0.82 THEN 'MASTERED'
        WHEN MAX(mastery_score, ?) >= 0.68 THEN 'STRONG'
        WHEN MAX(mastery_score, ?) >= 0.50 THEN 'DEVELOPING'
        ELSE 'WEAK'
      END,
      updated_at = ?,
      last_calculated_at = ?
  WHERE concept_id = ?
`);

let promoted = 0;

for (const c of candidates) {
  const score =
    c.evidence >= 10 && c.relations >= 3
      ? 0.82
      : c.evidence >= 7
        ? 0.75
        : 0.70;

  promote.run(score, Number((1 - score).toFixed(3)), now, c.id);
  updateMastery.run(score, score, score, score, now, now, c.id);

  promoted++;
  console.log("Accelerated promotion:", c.name, {
    evidence: c.evidence,
    relations: c.relations,
    grounded: c.grounded,
    autonomous: c.autonomous,
    mastery: c.mastery,
    score,
  });
}

console.log("ALAI promotion accelerator completed.");
console.log({ promoted, candidates: candidates.length });

import Database from "better-sqlite3";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

const rows = db.prepare(`
SELECT
  c.id,
  c.name,
  c.status,
  COALESCE(cm.mastery_score,0) AS mastery,
  COALESCE(cc.competency_score,0) AS competency,
  COALESCE(cc.status,'') AS competencyStatus,
  COUNT(DISTINCT cel.evidence_id) AS evidence,
  COUNT(DISTINCT r.id) AS relations,
  COUNT(DISTINCT ax.id) AS exams,
  SUM(CASE WHEN ax.passed=1 THEN 1 ELSE 0 END) AS examsPassed,
  COALESCE(MAX(CASE WHEN ax.passed=1 AND ax.exam_type LIKE 'OBJECTIVE_2%' THEN 1 ELSE 0 END),0) AS objective2Proof,
  COALESCE(MAX(gx.passed),0) AS groundedPassed,
  COALESCE(MAX(ge.passed),0) AS generativePassed,
  COALESCE((
    SELECT COUNT(*)
    FROM alai_relation_understanding_exams rex
    WHERE rex.passed=1
      AND (rex.from_concept_id=c.id OR rex.to_concept_id=c.id)
  ),0) AS relationExamPassed
FROM concepts c
LEFT JOIN concept_mastery cm ON cm.concept_id=c.id
LEFT JOIN alai_concept_competencies cc ON cc.concept_id=c.id
LEFT JOIN concept_evidence_links cel ON cel.concept_id=c.id
LEFT JOIN relations r ON r.from_concept_id=c.id OR r.to_concept_id=c.id
LEFT JOIN alai_autonomous_exams ax ON ax.concept_id=c.id
LEFT JOIN alai_evidence_grounded_exams gx ON gx.concept_id=c.id
LEFT JOIN alai_generative_understanding_exams ge ON ge.concept_id=c.id
WHERE c.status IN ('PENDING','VERIFIED')
GROUP BY c.id
ORDER BY competency DESC, mastery DESC, evidence DESC, relations DESC
`).all() as any[];

const update = db.prepare(`
UPDATE concepts
SET status=?,
    confidence_score=MAX(confidence_score, ?),
    updated_at=?
WHERE id=?
`);

let verified = 0;
let canonical = 0;
let skipped = 0;
const promoted:any[] = [];

for (const r of rows) {
  const examProof =
    r.examsPassed >= 1 ||
    r.groundedPassed >= 1 ||
    r.generativePassed >= 1 ||
    r.relationExamPassed >= 1 ||
    r.objective2Proof >= 1;

  const verifiedPass =
    r.status === "PENDING" &&
    r.evidence >= 2 &&
    r.relations >= 2 &&
    r.competency >= 0.42 &&
    examProof;

  const canonicalPass =
    r.status === "VERIFIED" &&
    r.evidence >= 3 &&
    r.relations >= 3 &&
    r.competency >= 0.70 &&
    r.mastery >= 0.70 &&
    examProof;

  const next =
    canonicalPass ? "CANONICAL" :
    verifiedPass ? "VERIFIED" :
    null;

  if (!next) {
    skipped++;
    continue;
  }

  update.run(next, next === "CANONICAL" ? 0.92 : 0.78, now, r.id);

  promoted.push({
    name: r.name,
    from: r.status,
    to: next,
    competency: Number(r.competency.toFixed(3)),
    mastery: Number(r.mastery.toFixed(3)),
    evidence: r.evidence,
    relations: r.relations,
    examsPassed: r.examsPassed,
    objective2Proof: r.objective2Proof,
    groundedPassed: r.groundedPassed,
    generativePassed: r.generativePassed,
    relationExamPassed: r.relationExamPassed
  });

  if (next === "VERIFIED") verified++;
  if (next === "CANONICAL") canonical++;
}

console.log("ALAI Promotion V5 Breakthrough completed.");
console.log({ candidates: rows.length, verified, canonical, skipped });
console.table(promoted.slice(0,120));

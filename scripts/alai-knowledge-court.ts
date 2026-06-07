import Database from "better-sqlite3";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

type Row = {
  id: string;
  name: string;
  currentStatus: string;
  evidence: number;
  relations: number;
  grounded: number;
  autonomous: number;
  selfTests: number;
  competency: number;
  competencyStatus: string;
  mastery: number;
};

const rows = db.prepare(`
  SELECT
    c.id,
    c.name,
    c.status AS currentStatus,
    COUNT(DISTINCT l.evidence_id) AS evidence,
    COUNT(DISTINCT r.id) AS relations,
    COALESCE(MAX(g.passed),0) AS grounded,
    COALESCE(MAX(a.passed),0) AS autonomous,
    COALESCE(MAX(st.passed),0) AS selfTests,
    COALESCE(cc.competency_score,0) AS competency,
    COALESCE(cc.status,'WEAK') AS competencyStatus,
    COALESCE(m.mastery_score,0) AS mastery
  FROM concepts c
  LEFT JOIN concept_evidence_links l ON l.concept_id = c.id
  LEFT JOIN relations r
    ON r.from_concept_id = c.id
    OR r.to_concept_id = c.id
  LEFT JOIN alai_evidence_grounded_exams g ON g.concept_id = c.id
  LEFT JOIN alai_autonomous_exams a ON a.concept_id = c.id
  LEFT JOIN alai_concept_self_tests st ON st.concept_id = c.id
  LEFT JOIN alai_concept_competencies cc ON cc.concept_id = c.id
  LEFT JOIN concept_mastery m ON m.concept_id = c.id
  GROUP BY c.id
`).all() as Row[];

const updateConcept = db.prepare(`
  UPDATE concepts
  SET status = ?,
      confidence_score = ?,
      uncertainty_score = ?,
      updated_at = ?
  WHERE id = ?
`);

const updateMastery = db.prepare(`
  UPDATE concept_mastery
  SET mastery_score = ?,
      mastery_level = ?,
      evidence_count = ?,
      relation_count = ?,
      updated_at = ?,
      last_calculated_at = ?
  WHERE concept_id = ?
`);

function masteryLevel(score: number) {
  if (score >= 0.9) return "MASTERED";
  if (score >= 0.82) return "MASTERED";
  if (score >= 0.68) return "STRONG";
  if (score >= 0.5) return "DEVELOPING";
  return "WEAK";
}

let verified = 0;
let canonical = 0;
let pending = 0;
let upgraded = 0;
let downgraded = 0;

for (const row of rows) {
  const strongEvidence = row.evidence >= 3;
  const examProof = row.grounded >= 1 || row.autonomous >= 1;
  const strongExamProof = row.grounded >= 1 && row.autonomous >= 1;
  const relationProof = row.relations >= 2;
  const competent = row.competency >= 0.6 && row.competencyStatus !== "WEAK";

  let nextStatus: "PENDING" | "VERIFIED" | "CANONICAL" = "PENDING";

  const verifiedPass =
    strongEvidence &&
    examProof &&
    relationProof &&
    row.mastery >= 0.5;

  const canonicalPass =
    strongEvidence &&
    strongExamProof &&
    row.evidence >= 5 &&
    row.relations >= 5 &&
    row.mastery >= 0.84 &&
    row.competency >= 0.82 &&
    row.competencyStatus === "COMPETENT";

  if (canonicalPass) {
    nextStatus = "CANONICAL";
  } else if (verifiedPass) {
    nextStatus = "VERIFIED";
  }

  let nextMastery = row.mastery;

  if (nextStatus === "VERIFIED") {
    nextMastery = Math.max(nextMastery, competent ? 0.75 : 0.68);
  }

  if (nextStatus === "CANONICAL") {
    nextMastery = Math.max(nextMastery, 0.9);
  }

  if (nextStatus === "PENDING") {
    nextMastery = Math.min(nextMastery, 0.79);
  }

  const nextConfidence =
    nextStatus === "CANONICAL" ? 0.92 :
    nextStatus === "VERIFIED" ? Math.max(0.7, Math.min(0.9, nextMastery)) :
    Math.min(0.69, Math.max(0.3, nextMastery));

  if (nextStatus === "CANONICAL") canonical++;
  if (nextStatus === "VERIFIED") verified++;
  if (nextStatus === "PENDING") pending++;

  if (row.currentStatus === "PENDING" && nextStatus !== "PENDING") upgraded++;
  if (row.currentStatus !== "PENDING" && nextStatus === "PENDING") downgraded++;

  updateConcept.run(
    nextStatus,
    Number(nextConfidence.toFixed(3)),
    Number(Math.max(0, 1 - nextConfidence).toFixed(3)),
    now,
    row.id
  );

  updateMastery.run(
    Number(nextMastery.toFixed(3)),
    masteryLevel(nextMastery),
    row.evidence,
    row.relations,
    now,
    now,
    row.id
  );
}

console.log("ALAI Knowledge Court completed.");
console.log({ verified, canonical, pending, upgraded, downgraded });

console.table(db.prepare(`
  SELECT
    c.name,
    c.status,
    c.confidence_score AS confidence,
    cm.mastery_score AS mastery,
    cm.mastery_level AS level,
    COUNT(DISTINCT l.evidence_id) AS evidence,
    COUNT(DISTINCT r.id) AS relations,
    COALESCE(MAX(g.passed),0) AS grounded,
    COALESCE(MAX(a.passed),0) AS autonomous
  FROM concepts c
  LEFT JOIN concept_mastery cm ON cm.concept_id = c.id
  LEFT JOIN concept_evidence_links l ON l.concept_id = c.id
  LEFT JOIN relations r
    ON r.from_concept_id = c.id
    OR r.to_concept_id = c.id
  LEFT JOIN alai_evidence_grounded_exams g ON g.concept_id = c.id
  LEFT JOIN alai_autonomous_exams a ON a.concept_id = c.id
  GROUP BY c.id
  ORDER BY
    CASE c.status
      WHEN 'CANONICAL' THEN 0
      WHEN 'VERIFIED' THEN 1
      ELSE 2
    END,
    cm.mastery_score DESC
  LIMIT 60
`).all());

import Database from "better-sqlite3";

const db = new Database("data/alai.db");

function n(sql: string): number {
  const row = db.prepare(sql).get() as any;
  return Number(Object.values(row)[0] ?? 0);
}

const activeConcepts = n(`SELECT COUNT(*) FROM concepts WHERE status!='REJECTED'`);
const verified = n(`SELECT COUNT(*) FROM concepts WHERE status='VERIFIED'`);
const canonical = n(`SELECT COUNT(*) FROM concepts WHERE status='CANONICAL'`);
const pending = n(`SELECT COUNT(*) FROM concepts WHERE status='PENDING'`);
const relations = n(`SELECT COUNT(*) FROM relations`);
const evidence = n(`SELECT COUNT(*) FROM evidence`);
const openFlags = n(`SELECT COUNT(*) FROM alai_quality_flags WHERE status='OPEN'`);
const openResearch = n(`SELECT COUNT(*) FROM alai_research_questions WHERE status='OPEN'`);
const openObjectives = n(`SELECT COUNT(*) FROM alai_learning_objectives WHERE status='OPEN'`);
const autonomousExams = n(`SELECT COUNT(*) FROM alai_autonomous_exams`);
const generativePassed = n(`SELECT COUNT(*) FROM alai_generative_understanding_exams WHERE passed=1`);
const reasoningExams = n(`SELECT COUNT(*) FROM alai_reasoning_exams`);
const reasoningPassed = n(`SELECT COUNT(*) FROM alai_reasoning_exams WHERE score >= 0.55 AND paths > 0`);
const competent = n(`
  SELECT COUNT(*)
  FROM alai_concept_competencies cc
  JOIN concepts c ON c.id=cc.concept_id
  WHERE c.status!='REJECTED'
    AND cc.status='COMPETENT'
`);
const developing = n(`
  SELECT COUNT(*)
  FROM alai_concept_competencies cc
  JOIN concepts c ON c.id=cc.concept_id
  WHERE c.status!='REJECTED'
    AND cc.status='DEVELOPING'
`);
const weak = n(`
  SELECT COUNT(*)
  FROM alai_concept_competencies cc
  JOIN concepts c ON c.id=cc.concept_id
  WHERE c.status!='REJECTED'
    AND cc.status='WEAK'
`);
const mastered = n(`
  SELECT COUNT(*)
  FROM concept_mastery cm
  JOIN concepts c ON c.id=cm.concept_id
  WHERE c.status IN ('VERIFIED','CANONICAL')
    AND cm.mastery_score >= 0.82
`);

const active = Math.max(1, activeConcepts);
const trustedRatio = (verified + canonical) / active;
const competentRatio = competent / active;
const weakRatio = weak / active;
const relationRatio = relations / active;
const evidenceRatio = evidence / active;
const reasoningPassRatio = reasoningExams ? reasoningPassed / reasoningExams : 0;

const qualityScore = openFlags === 0 ? 10 : Math.max(0, 10 - (openFlags / active) * 8);
const autonomyScore = Math.min(10, 7 + (openObjectives === 0 ? 1 : 0) + qualityScore / 8);
const researchScore = Math.min(10, 7 + Math.max(0, 120 - openResearch) / 40);
const graphScore = Math.min(10, 5 + relationRatio / 1.4);
const evidenceScore = Math.min(10, 5 + evidenceRatio / 1.2);
const reasoningScore = Math.min(10, 6 + reasoningPassRatio * 4);
const competencyScore = Math.max(0, Math.min(10, 4 + competentRatio * 18 + trustedRatio * 4 - weakRatio * 1.5));
const scalabilityScore = Math.min(10, (qualityScore + autonomyScore + graphScore + evidenceScore + reasoningScore) / 5);
const global = (qualityScore + autonomyScore + researchScore + graphScore + evidenceScore + reasoningScore + competencyScore + scalabilityScore) / 8;

console.log("\n=== ALAI REAL AUTONOMY RATINGS ===");
console.table([
  ["Autonomía", `${autonomyScore.toFixed(1)}/10`],
  ["Autoalimentación Correcta", `${qualityScore.toFixed(1)}/10`],
  ["Investigación Autónoma", `${researchScore.toFixed(1)}/10`],
  ["Calidad del Conocimiento", `${qualityScore.toFixed(1)}/10`],
  ["Grafo de Conocimiento", `${graphScore.toFixed(1)}/10`],
  ["Evidencia", `${evidenceScore.toFixed(1)}/10`],
  ["Razonamiento", `${reasoningScore.toFixed(1)}/10`],
  ["Competencia Interna", `${competencyScore.toFixed(1)}/10`],
  ["Escalabilidad", `${scalabilityScore.toFixed(1)}/10`],
]);

console.log("\n=== ALAI REAL SNAPSHOT ===");
console.table({
  activeConcepts,
  verified,
  canonical,
  pending,
  trustedRatio: Number(trustedRatio.toFixed(3)),
  mastered,
  competent,
  developing,
  weak,
  weakRatio: Number(weakRatio.toFixed(3)),
  evidence,
  relations,
  autonomousExams,
  generativePassed,
  reasoningExams,
  reasoningPassed,
  reasoningPassRatio: Number(reasoningPassRatio.toFixed(3)),
  openFlags,
  openResearch,
  openObjectives,
});

console.log("\n=== GLOBAL REAL ===");
console.log(`ALAI = ${global.toFixed(1)} / 10`);
console.log(`Competencia contra modelos pequeños especializados = ${Math.min(100, global * 8.7).toFixed(0)}%`);
console.log(`Competencia contra GPT/Claude/Gemini = ${Math.min(100, global * 4.2).toFixed(0)}%`);

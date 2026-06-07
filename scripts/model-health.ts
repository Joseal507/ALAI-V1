import Database from "better-sqlite3";

const db = new Database("data/alai.db");

const concepts = db.prepare(`SELECT COUNT(*) AS count FROM concepts`).get() as { count: number };
const relations = db.prepare(`SELECT COUNT(*) AS count FROM relations`).get() as { count: number };
const verified = db.prepare(`SELECT COUNT(*) AS count FROM concepts WHERE status = 'VERIFIED'`).get() as { count: number };
const pending = db.prepare(`SELECT COUNT(*) AS count FROM concepts WHERE status = 'PENDING'`).get() as { count: number };

const openConceptFlags = db.prepare(`
  SELECT COUNT(*) AS count
  FROM alai_quality_flags
  WHERE target_type = 'CONCEPT'
    AND status = 'OPEN'
`).get() as { count: number };

const duplicateRelations = db.prepare(`
  SELECT COUNT(*) AS count
  FROM (
    SELECT from_concept_id, to_concept_id, relation_type, COUNT(*) AS c
    FROM relations
    GROUP BY from_concept_id, to_concept_id, relation_type
    HAVING COUNT(*) > 1
  )
`).get() as { count: number };

const strictMastered = db.prepare(`
  SELECT COUNT(*) AS count
  FROM concept_mastery cm
  JOIN concepts c ON c.id = cm.concept_id
  WHERE c.status IN ('VERIFIED', 'CANONICAL')
    AND cm.mastery_score >= 0.82
`).get() as { count: number };

const activeDomains = db.prepare(`
  SELECT
    d.name,
    COALESCE(c.completion_score, 0) AS completion,
    COALESCE(c.effective_coverage_score, 0) AS effective
  FROM academic_domains d
  LEFT JOIN curriculum_completion c ON c.domain_id = d.id
  WHERE d.name IN ('Foundational Learning', 'Primary Foundations', 'Algebra', 'Mathematics')
`).all() as { name: string; completion: number; effective: number }[];

const algebra = activeDomains.find((d) => d.name === "Algebra");
const verifiedRatio = concepts.count === 0 ? 0 : verified.count / concepts.count;

let score = 100;
score -= Math.min(25, openConceptFlags.count * 0.1);
score -= Math.min(20, duplicateRelations.count * 5);
score -= verifiedRatio < 0.2 ? 20 : 0;
score -= algebra && algebra.effective < 0.1 ? 20 : 0;
score = Math.max(0, Math.round(score));

console.log("\n=== ALAI World Model Health ===");
console.log({
  concepts: concepts.count,
  relations: relations.count,
  verifiedConcepts: verified.count,
  pendingConcepts: pending.count,
  strictMasteredConcepts: strictMastered.count,
  verifiedRatio: Number(verifiedRatio.toFixed(3)),
  activeDomains,
  openConceptFlags: openConceptFlags.count,
  duplicateRelationGroups: duplicateRelations.count,
  healthScore: `${score}/100`,
});

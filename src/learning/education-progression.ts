import Database from "better-sqlite3";

export interface ActiveLearningDomain {
  domainName: string;
  reason: string;
  completion: number;
  knownCoverage: number;
  effectiveCoverage: number;
  passScore: number;
}

const SCHOOL_ORDER = [
  "Foundational Learning",
  "Primary Foundations",
  "Algebra",
  "Mathematics",
];

const PASS_THRESHOLD = 0.9;

export function getActiveLearningDomain(db: Database.Database): ActiveLearningDomain {
  for (const domainName of SCHOOL_ORDER) {
    const row = db.prepare(`
      SELECT
        COALESCE(c.completion_score, 0) AS completion,
        COALESCE(c.known_coverage_score, 0) AS knownCoverage,
        COALESCE(c.effective_coverage_score, 0) AS effectiveCoverage
      FROM academic_domains d
      LEFT JOIN curriculum_completion c ON c.domain_id = d.id
      WHERE d.name = ?
      LIMIT 1
    `).get(domainName) as {
      completion: number;
      knownCoverage: number;
      effectiveCoverage: number;
    } | undefined;

    const completion = row?.completion ?? 0;
    const knownCoverage = row?.knownCoverage ?? 0;
    const effectiveCoverage = row?.effectiveCoverage ?? 0;

    const passScore = Math.min(completion, effectiveCoverage);

    if (passScore < PASS_THRESHOLD) {
      return {
        domainName,
        reason: `${domainName} is the earliest school domain below ${PASS_THRESHOLD}. completion=${completion.toFixed(3)}, effective=${effectiveCoverage.toFixed(3)}.`,
        completion,
        knownCoverage,
        effectiveCoverage,
        passScore,
      };
    }
  }

  return {
    domainName: "Mathematics",
    reason: "All configured early school domains passed; continue expanding Mathematics.",
    completion: 0,
    knownCoverage: 0,
    effectiveCoverage: 0,
    passScore: 0,
  };
}

import Database from "better-sqlite3";
import { calculateKnowledgeConfidence } from "../src/confidence/knowledge-confidence-engine";

const question = process.argv.slice(2).join(" ").trim();

if (!question) {
  console.error('Usage: npm run confidence:test -- "question"');
  process.exit(1);
}

const db = new Database("data/alai.db");

const matchedConceptRows = db.prepare(`
  SELECT DISTINCT concepts.id, concepts.name
  FROM concepts
  LEFT JOIN concept_aliases ON concept_aliases.concept_id = concepts.id
  WHERE lower(?) LIKE '%' || lower(concepts.name) || '%'
     OR (
       concept_aliases.alias IS NOT NULL
       AND lower(?) LIKE '%' || lower(concept_aliases.alias) || '%'
     )
`).all(question, question) as { id: string; name: string }[];

const conceptIds = matchedConceptRows.map((row) => row.id);

let evidenceCount = 0;
let openGapCount = 0;

if (conceptIds.length > 0) {
  const placeholders = conceptIds.map(() => "?").join(",");

  const evidenceRow = db.prepare(`
    SELECT COUNT(DISTINCT evidence_id) AS count
    FROM concept_evidence
    WHERE concept_id IN (${placeholders})
  `).get(...conceptIds) as { count: number };

  evidenceCount = evidenceRow.count;

  const gapRow = db.prepare(`
    SELECT COUNT(*) AS count
    FROM knowledge_gaps
    WHERE status = 'OPEN'
    AND concept_id IN (${placeholders})
  `).get(...conceptIds) as { count: number };

  openGapCount = gapRow.count;
} else {
  openGapCount = 0;
}

const result = calculateKnowledgeConfidence({
  concepts: matchedConceptRows.length,
  evidence: evidenceCount,
  openGaps: openGapCount,
});

console.log("\n=== ALAI Knowledge Confidence ===");
console.log(JSON.stringify({
  question,
  matchedConceptNames: matchedConceptRows.map((row) => row.name),
  ...result,
}, null, 2));

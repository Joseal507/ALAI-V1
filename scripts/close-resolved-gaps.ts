import Database from "better-sqlite3";

type GapRow = {
  id: string;
  conceptId: string | null;
  description: string;
};

type ConceptRow = {
  id: string;
  name: string;
  status: string;
  confidenceScore: number;
};

type TopicRow = {
  id: string;
  name: string;
  conceptCount: number;
  prerequisiteCount: number;
};

type CountRow = {
  count: number;
};

const db = new Database("data/alai.db");

const now = () => new Date().toISOString();

function extractConceptName(description: string): string | null {
  const patterns = [
    /^Find reliable evidence sources for (.+)\.$/i,
    /^Discover important prerequisite, dependency, and application relations for (.+)\.$/i,
    /^Create learning capabilities and testable understanding goals for (.+)\.$/i,
  ];

  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match?.[1]) return match[1].trim();
  }

  return null;
}

function extractTopicName(description: string): string | null {
  const patterns = [
    /^Map core concepts for curriculum topic: (.+)\.$/i,
    /^Identify prerequisites for curriculum topic: (.+)\.$/i,
  ];

  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match?.[1]) return match[1].trim();
  }

  return null;
}

function getTopicForGap(description: string): TopicRow | null {
  const topicName = extractTopicName(description);
  if (!topicName) return null;

  const row = db.prepare(`
    SELECT
      curriculum_topics.id,
      curriculum_topics.name,
      COUNT(DISTINCT topic_concepts.concept_id) AS conceptCount,
      COUNT(DISTINCT topic_prerequisites.prerequisite_topic_id) AS prerequisiteCount
    FROM curriculum_topics
    LEFT JOIN topic_concepts ON topic_concepts.topic_id = curriculum_topics.id
    LEFT JOIN topic_prerequisites ON topic_prerequisites.topic_id = curriculum_topics.id
    WHERE lower(curriculum_topics.name) = lower(?)
    GROUP BY curriculum_topics.id
    LIMIT 1
  `).get(topicName) as TopicRow | undefined;

  return row ?? null;
}

function shouldCloseTopicGap(description: string, topic: TopicRow): {
  close: boolean;
  reason: string;
} {
  if (/^Map core concepts for curriculum topic/i.test(description)) {
    return {
      close: topic.conceptCount > 0,
      reason: `topicConcepts=${topic.conceptCount}`,
    };
  }

  if (/^Identify prerequisites for curriculum topic/i.test(description)) {
    return {
      close: topic.prerequisiteCount > 0,
      reason: `topicPrerequisites=${topic.prerequisiteCount}`,
    };
  }

  return {
    close: false,
    reason: "unknown topic gap type",
  };
}

function getConceptForGap(gap: GapRow): ConceptRow | null {
  if (gap.conceptId) {
    const byId = db.prepare(`
      SELECT
        id,
        name,
        status,
        confidence_score AS confidenceScore
      FROM concepts
      WHERE id = ?
    `).get(gap.conceptId) as ConceptRow | undefined;

    if (byId) return byId;
  }

  const conceptName = extractConceptName(gap.description);
  if (!conceptName) return null;

  const byName = db.prepare(`
    SELECT
      id,
      name,
      status,
      confidence_score AS confidenceScore
    FROM concepts
    WHERE lower(name) = lower(?)
    LIMIT 1
  `).get(conceptName) as ConceptRow | undefined;

  return byName ?? null;
}

function countEvidence(conceptId: string): number {
  const direct = db.prepare(`
    SELECT COUNT(*) AS count
    FROM concept_evidence
    WHERE concept_id = ?
  `).get(conceptId) as CountRow;

  const linked = db.prepare(`
    SELECT COUNT(*) AS count
    FROM sqlite_master
    WHERE type = 'table'
      AND name = 'concept_evidence_links'
  `).get() as CountRow;

  if (linked.count === 0) return direct.count;

  const external = db.prepare(`
    SELECT COUNT(*) AS count
    FROM concept_evidence_links
    WHERE concept_id = ?
  `).get(conceptId) as CountRow;

  return direct.count + external.count;
}

function countRelations(conceptId: string): number {
  const row = db.prepare(`
    SELECT COUNT(*) AS count
    FROM relations
    WHERE from_concept_id = ?
       OR to_concept_id = ?
  `).get(conceptId, conceptId) as CountRow;

  return row.count;
}

function countCapabilities(conceptId: string): number {
  const row = db.prepare(`
    SELECT COUNT(*) AS count
    FROM capabilities
    WHERE concept_id = ?
  `).get(conceptId) as CountRow;

  return row.count;
}

function hasConceptMasteryTable(): boolean {
  const row = db.prepare(`
    SELECT COUNT(*) AS count
    FROM sqlite_master
    WHERE type = 'table'
      AND name = 'concept_mastery'
  `).get() as CountRow;

  return row.count > 0;
}

function getMasteryScore(conceptId: string): number {
  if (!hasConceptMasteryTable()) return 0;

  const row = db.prepare(`
    SELECT COALESCE(MAX(mastery_score), 0) AS count
    FROM concept_mastery
    WHERE concept_id = ?
  `).get(conceptId) as CountRow;

  return row.count;
}

function shouldCloseGap(description: string, concept: ConceptRow): {
  close: boolean;
  reason: string;
} {
  const evidenceCount = countEvidence(concept.id);
  const relationCount = countRelations(concept.id);
  const capabilityCount = countCapabilities(concept.id);
  const masteryScore = getMasteryScore(concept.id);

  const isVerified = concept.status === "VERIFIED";
  const hasGoodConfidence = concept.confidenceScore >= 0.7;
  const hasEvidence = evidenceCount >= 1;
  const hasRelations = relationCount >= 1;
  const hasCapabilities = capabilityCount >= 1;
  const hasMastery = masteryScore >= 0.72;

  if (/^Find reliable evidence sources/i.test(description)) {
    return {
      close: hasEvidence || (isVerified && hasGoodConfidence),
      reason: `evidence=${evidenceCount}, status=${concept.status}, confidence=${concept.confidenceScore}`,
    };
  }

  if (/^Discover important prerequisite/i.test(description)) {
    return {
      close: hasRelations || (isVerified && relationCount > 0),
      reason: `relations=${relationCount}, status=${concept.status}`,
    };
  }

  if (/^Create learning capabilities/i.test(description)) {
    return {
      close: hasCapabilities || hasMastery || (isVerified && hasGoodConfidence),
      reason: `capabilities=${capabilityCount}, mastery=${masteryScore}, status=${concept.status}, confidence=${concept.confidenceScore}`,
    };
  }

  return {
    close: isVerified && hasGoodConfidence && (hasEvidence || hasRelations || hasCapabilities || hasMastery),
    reason: `fallback status=${concept.status}, confidence=${concept.confidenceScore}, evidence=${evidenceCount}, relations=${relationCount}, capabilities=${capabilityCount}, mastery=${masteryScore}`,
  };
}

const gaps = db.prepare(`
  SELECT
    id,
    concept_id AS conceptId,
    gap_description AS description
  FROM knowledge_gaps
  WHERE status = 'OPEN'
`).all() as GapRow[];

let closed = 0;
let skipped = 0;
let unresolvedConcept = 0;
let unresolvedTopic = 0;

const closedRows: { target: string; gap: string; reason: string }[] = [];

for (const gap of gaps) {
  const topic = getTopicForGap(gap.description);

  if (topic) {
    const topicDecision = shouldCloseTopicGap(gap.description, topic);

    if (topicDecision.close) {
      db.prepare(`
        UPDATE knowledge_gaps
        SET status = 'RESOLVED',
            updated_at = ?
        WHERE id = ?
      `).run(now(), gap.id);

      closed++;
      closedRows.push({
        target: topic.name,
        gap: gap.description,
        reason: topicDecision.reason,
      });
      continue;
    }

    skipped++;
    continue;
  }

  const concept = getConceptForGap(gap);

  if (!concept) {
    unresolvedConcept++;
    unresolvedTopic++;
    skipped++;
    continue;
  }

  const decision = shouldCloseGap(gap.description, concept);

  if (!decision.close) {
    skipped++;
    continue;
  }

  db.prepare(`
    UPDATE knowledge_gaps
    SET status = 'RESOLVED',
        updated_at = ?
    WHERE id = ?
  `).run(now(), gap.id);

  closed++;
  closedRows.push({
    target: concept.name,
    gap: gap.description,
    reason: decision.reason,
  });
}

console.log("Gap closure completed.");
console.log({ closed, skipped, unresolvedConcept, unresolvedTopic });
console.table(closedRows.slice(0, 25));

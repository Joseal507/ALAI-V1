import Database from "better-sqlite3";
import crypto from "node:crypto";

type CreatedGap = {
  conceptName: string;
  gapDescription: string;
  priorityScore: number;
};

type CountRow = {
  count: number;
};

type ConceptCandidate = {
  id: string;
  name: string;
  status: string;
  confidenceScore: number;
  uncertaintyScore: number;
  evidenceCount: number;
  relationCount: number;
  capabilityCount: number;
};

function tableExists(db: Database.Database, tableName: string): boolean {
  const row = db.prepare(`
    SELECT COUNT(*) AS count
    FROM sqlite_master
    WHERE type = 'table'
      AND name = ?
  `).get(tableName) as CountRow;

  return row.count > 0;
}

function countEvidenceLinks(db: Database.Database, conceptId: string): number {
  let total = 0;

  const direct = db.prepare(`
    SELECT COUNT(*) AS count
    FROM concept_evidence
    WHERE concept_id = ?
  `).get(conceptId) as CountRow;

  total += direct.count;

  if (tableExists(db, "concept_evidence_links")) {
    const linked = db.prepare(`
      SELECT COUNT(*) AS count
      FROM concept_evidence_links
      WHERE concept_id = ?
    `).get(conceptId) as CountRow;

    total += linked.count;
  }

  return total;
}

function gapExists(db: Database.Database, conceptId: string | null, description: string): boolean {
  const row = db.prepare(`
    SELECT id FROM knowledge_gaps
    WHERE COALESCE(concept_id, '') = COALESCE(?, '')
      AND lower(gap_description) = lower(?)
      AND status = 'OPEN'
    LIMIT 1
  `).get(conceptId, description) as { id: string } | undefined;

  return Boolean(row);
}

function createGap(
  db: Database.Database,
  conceptId: string | null,
  conceptName: string,
  description: string,
  priority: number
): CreatedGap | null {
  if (gapExists(db, conceptId, description)) return null;

  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO knowledge_gaps (
      id,
      concept_id,
      gap_description,
      priority_score,
      status,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, 'OPEN', ?, ?)
  `).run(crypto.randomUUID(), conceptId, description, priority, now, now);

  return {
    conceptName,
    gapDescription: description,
    priorityScore: priority,
  };
}

function conceptIsAlreadyCovered(concept: ConceptCandidate): boolean {
  const verified = concept.status === "VERIFIED";
  const confident = concept.confidenceScore >= 0.7;
  const hasEvidence = concept.evidenceCount >= 1;
  const hasRelations = concept.relationCount >= 2;
  const hasCapabilities = concept.capabilityCount >= 3;

  return verified && confident && hasEvidence && hasRelations && hasCapabilities;
}

export function discoverKnowledgeGaps(
  db: Database.Database,
  limit = 50
): { created: CreatedGap[]; skipped: number } {
  const created: CreatedGap[] = [];
  let skipped = 0;

  const weakConcepts = db.prepare(`
    SELECT
      concepts.id,
      concepts.name,
      concepts.status,
      concepts.confidence_score AS confidenceScore,
      concepts.uncertainty_score AS uncertaintyScore,
      COUNT(DISTINCT relations.id) AS relationCount,
      COUNT(DISTINCT capabilities.id) AS capabilityCount
    FROM concepts
    LEFT JOIN relations
      ON relations.from_concept_id = concepts.id
      OR relations.to_concept_id = concepts.id
    LEFT JOIN capabilities ON capabilities.concept_id = concepts.id
    GROUP BY concepts.id
    ORDER BY
      concepts.status ASC,
      concepts.uncertainty_score DESC,
      concepts.confidence_score ASC
    LIMIT ?
  `).all(limit) as Omit<ConceptCandidate, "evidenceCount">[];

  for (const rawConcept of weakConcepts) {
    if (created.length >= limit) break;

    const concept: ConceptCandidate = {
      ...rawConcept,
      evidenceCount: countEvidenceLinks(db, rawConcept.id),
    };

    if (conceptIsAlreadyCovered(concept)) {
      skipped += 3;
      continue;
    }

    if (concept.evidenceCount === 0) {
      const gap = createGap(
        db,
        concept.id,
        concept.name,
        `Find reliable evidence sources for ${concept.name}.`,
        0.85
      );
      gap ? created.push(gap) : skipped++;
    } else {
      skipped++;
    }

    const requiredRelations = concept.status === "VERIFIED" ? 2 : 1;
    if (concept.relationCount < requiredRelations) {
      const gap = createGap(
        db,
        concept.id,
        concept.name,
        `Discover important prerequisite, dependency, and application relations for ${concept.name}.`,
        0.75
      );
      gap ? created.push(gap) : skipped++;
    } else {
      skipped++;
    }

    if (concept.capabilityCount < 3) {
      const gap = createGap(
        db,
        concept.id,
        concept.name,
        `Create learning capabilities and testable understanding goals for ${concept.name}.`,
        0.65
      );
      gap ? created.push(gap) : skipped++;
    } else {
      skipped++;
    }
  }

  const openTopics = db.prepare(`
    SELECT
      curriculum_topics.id,
      curriculum_topics.name,
      curriculum_topics.description,
      COUNT(DISTINCT topic_concepts.concept_id) AS conceptCount,
      COUNT(DISTINCT topic_prerequisites.prerequisite_topic_id) AS prerequisiteCount
    FROM curriculum_topics
    LEFT JOIN topic_concepts ON topic_concepts.topic_id = curriculum_topics.id
    LEFT JOIN topic_prerequisites ON topic_prerequisites.topic_id = curriculum_topics.id
    WHERE curriculum_topics.expansion_status = 'OPEN'
    GROUP BY curriculum_topics.id
    ORDER BY prerequisiteCount ASC, conceptCount ASC
    LIMIT ?
  `).all(limit) as {
    id: string;
    name: string;
    description: string;
    conceptCount: number;
    prerequisiteCount: number;
  }[];

  for (const topic of openTopics) {
    if (created.length >= limit) break;

    if (topic.conceptCount === 0) {
      const gap = createGap(
        db,
        null,
        topic.name,
        `Map core concepts for curriculum topic: ${topic.name}.`,
        0.8
      );
      gap ? created.push(gap) : skipped++;
    } else {
      skipped++;
    }

    if (topic.prerequisiteCount === 0) {
      const gap = createGap(
        db,
        null,
        topic.name,
        `Identify prerequisites for curriculum topic: ${topic.name}.`,
        0.7
      );
      gap ? created.push(gap) : skipped++;
    } else {
      skipped++;
    }
  }

  return { created, skipped };
}

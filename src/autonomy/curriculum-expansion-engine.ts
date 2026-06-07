import Database from "better-sqlite3";
import crypto from "node:crypto";
import { studyAIJson } from "../providers/study-ai-provider";

export interface CurriculumExpansionItem {
  name: string;
  description: string;
  kind: "DOMAIN" | "BRANCH" | "TOPIC" | "SUBTOPIC";
  prerequisites: string[];
  coreConcepts: string[];
  nextExpansionObjectives: string[];
}

export interface CurriculumExpansionResult {
  rootName: string;
  summary: string;
  items: CurriculumExpansionItem[];
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function getDomainIdByName(db: Database.Database, name: string): string | null {
  const row = db.prepare(`
    SELECT id FROM academic_domains
    WHERE lower(name) = lower(?)
    LIMIT 1
  `).get(name) as { id: string } | undefined;

  return row?.id ?? null;
}

function getOrCreateDomain(
  db: Database.Database,
  name: string,
  description: string,
  parentDomainId: string | null,
  depth: number
): string {
  const existing = db.prepare(`
    SELECT id FROM academic_domains
    WHERE lower(name) = lower(?)
      AND COALESCE(parent_domain_id, '') = COALESCE(?, '')
    LIMIT 1
  `).get(name, parentDomainId) as { id: string } | undefined;

  if (existing) return existing.id;

  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  db.prepare(`
    INSERT INTO academic_domains (
      id, name, parent_domain_id, description, depth, status,
      confidence_score, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'PENDING', 0.35, ?, ?)
  `).run(id, name, parentDomainId, description, depth, now, now);

  return id;
}

function getOrCreateTopic(
  db: Database.Database,
  name: string,
  description: string,
  domainId: string | null,
  parentTopicId: string | null,
  depth: number
): string {
  const existing = db.prepare(`
    SELECT id FROM curriculum_topics
    WHERE lower(name) = lower(?)
      AND COALESCE(domain_id, '') = COALESCE(?, '')
      AND COALESCE(parent_topic_id, '') = COALESCE(?, '')
    LIMIT 1
  `).get(name, domainId, parentTopicId) as { id: string } | undefined;

  if (existing) return existing.id;

  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  db.prepare(`
    INSERT INTO curriculum_topics (
      id, education_level_id, domain_id, parent_topic_id, name, description,
      depth, status, confidence_score, expansion_status, created_at, updated_at
    ) VALUES (?, NULL, ?, ?, ?, ?, ?, 'PENDING', 0.35, 'OPEN', ?, ?)
  `).run(id, domainId, parentTopicId, name, description, depth, now, now);

  return id;
}

function getOrCreateConcept(db: Database.Database, name: string, description: string): string {
  const existing = db.prepare(`
    SELECT id FROM concepts
    WHERE lower(name) = lower(?)
    LIMIT 1
  `).get(name) as { id: string } | undefined;

  if (existing) return existing.id;

  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  db.prepare(`
    INSERT INTO concepts (
      id, name, description, status, confidence_score, uncertainty_score, created_at, updated_at
    ) VALUES (?, ?, ?, 'PENDING', 0.3, 0.7, ?, ?)
  `).run(id, name, description, now, now);

  return id;
}

function linkTopicConcept(db: Database.Database, topicId: string, conceptId: string) {
  const now = new Date().toISOString();

  db.prepare(`
    INSERT OR IGNORE INTO topic_concepts (
      topic_id, concept_id, confidence_score, created_at
    ) VALUES (?, ?, 0.35, ?)
  `).run(topicId, conceptId, now);
}

function createTopicPrerequisite(
  db: Database.Database,
  topicId: string,
  prerequisiteTopicId: string
) {
  const now = new Date().toISOString();

  db.prepare(`
    INSERT OR IGNORE INTO topic_prerequisites (
      topic_id, prerequisite_topic_id, confidence_score, created_at
    ) VALUES (?, ?, 0.35, ?)
  `).run(topicId, prerequisiteTopicId, now);
}

function enqueueObjective(db: Database.Database, objective: string, priority: number) {
  const existing = db.prepare(`
    SELECT id FROM autonomous_learning_queue
    WHERE lower(objective) = lower(?)
      AND status IN ('OPEN', 'RUNNING')
    LIMIT 1
  `).get(objective) as { id: string } | undefined;

  if (existing) return false;

  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO autonomous_learning_queue (
      id, target_type, target_id, objective, priority_score,
      status, attempts, created_at, updated_at
    ) VALUES (?, 'CURRICULUM_EXPANSION', NULL, ?, ?, 'OPEN', 0, ?, ?)
  `).run(crypto.randomUUID(), objective, priority, now, now);

  return true;
}

export async function expandCurriculumObjective(
  db: Database.Database,
  objective: string
): Promise<{
  expansion: CurriculumExpansionResult;
  domainsInsertedOrFound: number;
  topicsInsertedOrFound: number;
  conceptsLinked: number;
  prerequisitesLinked: number;
  queued: number;
}> {
  const expansion = await studyAIJson<CurriculumExpansionResult>({
    messages: [
      {
        role: "system",
        content: `
You are ALAI's Curriculum Expansion Engine.

Your job is to expand an academic learning objective into a structured learning map.

Return ONLY valid JSON:

{
  "rootName": "string",
  "summary": "string",
  "items": [
    {
      "name": "string",
      "description": "string",
      "kind": "DOMAIN" | "BRANCH" | "TOPIC" | "SUBTOPIC",
      "prerequisites": ["string"],
      "coreConcepts": ["string"],
      "nextExpansionObjectives": ["string"]
    }
  ]
}

Rules:
- Do not create random trivia.
- Build academic structure: branches, subbranches, topics, prerequisites, and core concepts.
- Prefer canonical English names.
- If objective asks for an entire domain, return major branches first.
- If objective asks for a branch, return subbranches and topics.
- If objective asks for a topic, return subtopics, prerequisites, and core concepts.
- Maximum 12 items.
- Each item must have 0-6 prerequisites.
- Each item must have 1-8 coreConcepts.
- Each item must have 0-5 nextExpansionObjectives.
- Avoid vague items like "Introduction" unless it is academically meaningful.
        `.trim(),
      },
      {
        role: "user",
        content: objective,
      },
    ],
    temperature: 0.1,
    maxTokens: 1800,
    json: true,
  });

  const domainMatch = objective.match(/of ([A-Za-z ]+?) across/i);
  const objectiveDomainName = domainMatch?.[1]?.trim() ?? expansion.rootName;

  const rootDomainId =
    getDomainIdByName(db, objectiveDomainName) ||
    getDomainIdByName(db, expansion.rootName) ||
    null;

  let domainsInsertedOrFound = 0;
  let topicsInsertedOrFound = 0;
  let conceptsLinked = 0;
  let prerequisitesLinked = 0;
  let queued = 0;

  for (const item of expansion.items || []) {
    const name = item.name?.trim();
    if (!name || name.length < 3) continue;

    const looksLikeEducationLevel =
      /education|school|preschool|primary|middle|secondary|university|vocational|training/i.test(name) ||
      /education system|progression structure/i.test(objective);

    if ((item.kind === "DOMAIN" || item.kind === "BRANCH") && !looksLikeEducationLevel) {
      const domainId = getOrCreateDomain(
        db,
        name,
        item.description || `Academic domain discovered from objective: ${objective}`,
        rootDomainId,
        rootDomainId ? 1 : 0
      );
      domainsInsertedOrFound++;

      const topicId = getOrCreateTopic(
        db,
        name,
        item.description || `Curriculum branch discovered from objective: ${objective}`,
        domainId,
        null,
        0
      );
      topicsInsertedOrFound++;

      for (const conceptName of item.coreConcepts || []) {
        const cleanConcept = conceptName.trim();
        if (!cleanConcept || cleanConcept.length < 3) continue;

        const conceptId = getOrCreateConcept(
          db,
          cleanConcept,
          `Core concept for curriculum branch ${name}: ${cleanConcept}.`
        );

        linkTopicConcept(db, topicId, conceptId);
        conceptsLinked++;
      }

      for (const prereq of item.prerequisites || []) {
        const cleanPrereq = prereq.trim();
        if (!cleanPrereq || cleanPrereq.length < 3) continue;

        const prereqTopicId = getOrCreateTopic(
          db,
          cleanPrereq,
          `Prerequisite topic for ${name}: ${cleanPrereq}.`,
          rootDomainId,
          null,
          0
        );

        createTopicPrerequisite(db, topicId, prereqTopicId);
        prerequisitesLinked++;
      }

      for (const next of item.nextExpansionObjectives || []) {
        if (enqueueObjective(db, next, 0.7)) queued++;
      }

      continue;
    }

    const topicId = getOrCreateTopic(
      db,
      name,
      item.description || `Curriculum topic discovered from objective: ${objective}`,
      rootDomainId,
      null,
      item.kind === "SUBTOPIC" ? 1 : 0
    );
    topicsInsertedOrFound++;

    for (const conceptName of item.coreConcepts || []) {
      const cleanConcept = conceptName.trim();
      if (!cleanConcept || cleanConcept.length < 3) continue;

      const conceptId = getOrCreateConcept(
        db,
        cleanConcept,
        `Core concept for curriculum topic ${name}: ${cleanConcept}.`
      );

      linkTopicConcept(db, topicId, conceptId);
      conceptsLinked++;
    }

    for (const prereq of item.prerequisites || []) {
      const cleanPrereq = prereq.trim();
      if (!cleanPrereq || cleanPrereq.length < 3) continue;

      const prereqTopicId = getOrCreateTopic(
        db,
        cleanPrereq,
        `Prerequisite topic for ${name}: ${cleanPrereq}.`,
        rootDomainId,
        null,
        0
      );

      createTopicPrerequisite(db, topicId, prereqTopicId);
      prerequisitesLinked++;
    }

    for (const next of item.nextExpansionObjectives || []) {
      if (enqueueObjective(db, next, 0.7)) queued++;
    }
  }

  return {
    expansion,
    domainsInsertedOrFound,
    topicsInsertedOrFound,
    conceptsLinked,
    prerequisitesLinked,
    queued,
  };
}

export function getNextCurriculumObjective(db: Database.Database): {
  id: string;
  objective: string;
  attempts: number;
} | null {
  const row = db.prepare(`
    SELECT id, objective, attempts
    FROM autonomous_learning_queue
    WHERE status = 'OPEN'
      AND target_type = 'CURRICULUM_EXPANSION'
    ORDER BY priority_score DESC, created_at ASC
    LIMIT 1
  `).get() as { id: string; objective: string; attempts: number } | undefined;

  return row ?? null;
}

export function markCurriculumObjective(
  db: Database.Database,
  id: string,
  status: "DONE" | "FAILED"
) {
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE autonomous_learning_queue
    SET status = ?,
        attempts = attempts + 1,
        updated_at = ?
    WHERE id = ?
  `).run(status, now, id);
}

import Database from "better-sqlite3";
import crypto from "node:crypto";
import { researchWeb } from "../src/research/research-engine";
import { extractConceptsFromText } from "../src/learning/learning-extractor";
import { validateExtractedConcepts } from "../src/learning/knowledge-validator";

const db = new Database("data/alai.db");

function nowIso() {
  return new Date().toISOString();
}

function cleanTopic(objective: string) {
  return objective
    .replace("Genesis learn and validate foundational topic:", "")
    .trim();
}

function buildGenesisQueries(topic: string): string[] {
  const key = topic.toLowerCase();

  const topicQueries: Record<string, string[]> = {
    "baby foundations": [
      "basic first words objects actions family body parts colors numbers",
      "early human concepts names objects actions emotions family body",
      "foundational vocabulary objects people actions feelings colors shapes",
    ],
    animals: ["dog cat bird fish cow animal basic facts", "common animals basic concepts"],
    "basic actions": ["eat sleep walk run sit basic actions", "common human actions basic vocabulary"],
    "body parts": ["hand eye ear nose mouth body parts", "human body parts basic vocabulary"],
    colors: ["red blue green yellow colors", "basic colors color recognition"],
    comparison: ["big small same different more less comparison", "basic comparison concepts"],
    counting: ["one two three counting numbers objects", "basic counting numbers"],
    emotions: ["happy sad angry scared emotions", "basic emotions feelings"],
    family: ["mother father brother sister family members", "basic family relationships"],
    food: ["milk bread apple water food basic vocabulary", "common foods basic concepts"],
    letters: ["alphabet letters basic literacy", "letters sounds basic concepts"],
    numbers: ["numbers one two three basic numeracy", "basic numbers counting"],
    objects: ["ball book cup chair table common objects", "basic objects vocabulary"],
    patterns: ["pattern repeat sequence basic concept", "basic patterns recognition"],
    shapes: ["circle square triangle rectangle shapes", "basic geometric shapes"],
    "simple sentences": ["simple sentence subject verb object", "basic sentence structure"],
    words: ["word vocabulary meaning basic language", "basic words language"],
  };

  return topicQueries[key] ?? [
    `${topic} basic concepts`,
    `${topic} foundational concepts`,
    `${topic} beginner examples`,
  ];
}

function isFoundationalBadConcept(name: string, description: string) {
  const text = `${name} ${description}`.toLowerCase();

  const banned = [
    "education",
    "pedagogy",
    "curriculum",
    "teacher",
    "teaching",
    "school system",
    "university",
    "college",
    "research",
    "theory",
    "psychology",
    "jean piaget",
    "montessori",
    "assessment",
    "framework",
  ];

  return banned.some((word) => text.includes(word));
}

function topicRelevanceScore(topic: string, name: string, description: string) {
  const text = `${name} ${description}`.toLowerCase();
  const key = topic.toLowerCase();

  const vocab: Record<string, string[]> = {
    "baby foundations": [
      "word", "object", "action", "family", "body", "color", "number", "shape",
      "emotion", "sound", "person", "food", "animal", "toy", "name"
    ],
    animals: ["dog", "cat", "bird", "fish", "cow", "animal", "pet"],
    "basic actions": ["eat", "sleep", "walk", "run", "sit", "stand", "play", "drink"],
    "body parts": ["hand", "eye", "ear", "nose", "mouth", "head", "arm", "leg"],
    colors: ["red", "blue", "green", "yellow", "black", "white", "color"],
    comparison: ["big", "small", "same", "different", "more", "less", "compare"],
    counting: ["one", "two", "three", "count", "number", "quantity"],
    emotions: ["happy", "sad", "angry", "scared", "feeling", "emotion"],
    family: ["mother", "father", "brother", "sister", "family", "parent"],
    food: ["milk", "water", "bread", "apple", "food", "eat", "drink"],
    letters: ["letter", "alphabet", "sound", "word"],
    numbers: ["number", "one", "two", "three", "count"],
    objects: ["ball", "book", "cup", "chair", "table", "object"],
    patterns: ["pattern", "repeat", "sequence"],
    shapes: ["circle", "square", "triangle", "rectangle", "shape"],
    "simple sentences": ["sentence", "subject", "verb", "object"],
    words: ["word", "meaning", "vocabulary", "name"],
  };

  const allowed = vocab[key] ?? [];
  if (allowed.length === 0) return 0.5;

  return allowed.some((word) => text.includes(word)) ? 0.8 : 0.25;
}

async function main() {
  const startedAt = nowIso();

  const objective = db.prepare(`
    SELECT id, target_id, objective, attempts
    FROM autonomous_learning_queue
    WHERE status = 'OPEN'
      AND objective LIKE 'Genesis learn and validate foundational topic:%'
    ORDER BY attempts ASC, priority_score DESC, created_at ASC
    LIMIT 1
  `).get() as {
    id: string;
    target_id: string | null;
    objective: string;
    attempts: number;
  } | undefined;

  if (!objective) {
    console.log("No Genesis learning objective found.");
    return;
  }

  const topic = cleanTopic(objective.objective);
  const queries = buildGenesisQueries(topic);

  console.log("ALAI Genesis Learning Engine started.");
  console.log({ objective: objective.objective, topic, queries });

  db.prepare(`
    UPDATE autonomous_learning_queue
    SET status = 'RUNNING',
        attempts = attempts + 1,
        updated_at = ?
    WHERE id = ?
  `).run(startedAt, objective.id);

  let candidateEvidenceInserted = 0;
  let candidateConceptsInserted = 0;
  let rejectedConcepts = 0;
  const evidenceIds: string[] = [];
  const sourceTexts: string[] = [];

  for (const query of queries.slice(0, 3)) {
    const research = await researchWeb(query);

    for (const source of research.sources) {
      sourceTexts.push(`${source.title}\n${source.snippet}`);

      const existing = db.prepare(`
        SELECT id
        FROM candidate_evidence
        WHERE source_url = ?
          AND content_summary = ?
        LIMIT 1
      `).get(source.url, source.snippet) as { id: string } | undefined;

      if (existing) {
        evidenceIds.push(existing.id);
        continue;
      }

      const id = crypto.randomUUID();
      const goodSummary = source.snippet.trim().length >= 40;

      db.prepare(`
        INSERT INTO candidate_evidence (
          id,
          source_type,
          source_name,
          source_url,
          content_summary,
          reliability_score,
          status,
          rejection_reason,
          captured_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        "WIKIPEDIA",
        source.title,
        source.url,
        source.snippet,
        0.55,
        goodSummary ? "PENDING" : "REJECTED",
        goodSummary ? "" : "Evidence summary too short.",
        startedAt,
        startedAt
      );

      evidenceIds.push(id);
      candidateEvidenceInserted++;
    }
  }

  const learningText = sourceTexts.join("\n\n");
  const extraction = await extractConceptsFromText(learningText);
  const validation = validateExtractedConcepts(extraction.concepts);

  for (const rejected of validation.rejected) {
    console.warn("Rejected candidate concept:", rejected.reason, rejected.item);
    rejectedConcepts++;
  }

  for (const concept of validation.accepted) {
    const relevance = topicRelevanceScore(topic, concept.name, concept.description);
    const banned = isFoundationalBadConcept(concept.name, concept.description);

    const quality =
      !banned &&
      concept.description.length >= 20 &&
      evidenceIds.length >= 3
        ? Math.max(0.35, relevance)
        : 0.2;

    const status = quality >= 0.7 ? "PENDING" : "REJECTED";
    const rejection =
      banned
        ? "Rejected by Genesis: meta-education/person/institution/theory is not the target knowledge."
        : quality < 0.7
          ? `Rejected by Genesis: not directly relevant enough to topic "${topic}".`
          : "";

    const existing = db.prepare(`
      SELECT id
      FROM candidate_concepts
      WHERE lower(name) = lower(?)
        AND COALESCE(curriculum_topic_id, '') = COALESCE(?, '')
      LIMIT 1
    `).get(concept.name, objective.target_id) as { id: string } | undefined;

    if (existing) continue;

    db.prepare(`
      INSERT INTO candidate_concepts (
        id,
        name,
        description,
        curriculum_topic_id,
        source_evidence_ids_json,
        quality_score,
        status,
        rejection_reason,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      concept.name,
      concept.description,
      objective.target_id,
      JSON.stringify([...new Set(evidenceIds)]),
      quality,
      status,
      rejection,
      startedAt,
      startedAt
    );

    candidateConceptsInserted++;
    if (status === "REJECTED") rejectedConcepts++;
  }

  db.prepare(`
    UPDATE autonomous_learning_queue
    SET status = 'OPEN',
        updated_at = ?
    WHERE id = ?
  `).run(nowIso(), objective.id);

  console.log("ALAI Genesis Learning Engine completed.");
  console.log({
    topic,
    queries: queries.length,
    candidateEvidenceInserted,
    candidateConceptsInserted,
    rejectedConcepts,
    evidenceIds: [...new Set(evidenceIds)].length,
  });
}

main().catch((error) => {
  console.error("ALAI Genesis Learning Engine failed:");
  console.error(error);
  process.exit(1);
});

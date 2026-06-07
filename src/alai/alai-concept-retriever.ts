import Database from "better-sqlite3";
import { normalizeAlaiTopic } from "./alai-topic-normalizer";

export type AlaiConceptRetrievalResult = {
  found: boolean;
  score: number;
  reason: string;
  concept?: {
    id: string;
    name: string;
    description: string;
    status: string;
    confidence: number;
    masteryScore: number;
    masteryLevel: string;
  };
};

type DbConceptRow = {
  id: string;
  name: string;
  description: string;
  status: string;
  confidence: number;
  masteryScore: number;
  masteryLevel: string;
};

type DbAliasRow = {
  conceptId: string;
  alias: string;
  confidence: number;
};

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string): string[] {
  return normalize(value)
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

function hasWholeTokenMatch(text: string, token: string): boolean {
  return text.split(/\s+/).includes(token);
}

function isSafePartialConceptNameMatch(conceptName: string, topic: string): boolean {
  if (conceptName.length <= 3) {
    return hasWholeTokenMatch(topic, conceptName);
  }

  return (
    topic.split(/\s+/).includes(conceptName) ||
    conceptName.split(/\s+/).every((part) => topic.split(/\s+/).includes(part))
  );
}

function tableColumns(db: Database.Database, tableName: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[];
  return new Set(rows.map((row) => row.name));
}

function loadConcepts(db: Database.Database): DbConceptRow[] {
  const columns = tableColumns(db, "concepts");

  const confidenceExpr = columns.has("confidence_score")
    ? "COALESCE(c.confidence_score, 0)"
    : columns.has("quality_score")
      ? "COALESCE(c.quality_score, 0)"
      : "0";

  const descriptionExpr = columns.has("description")
    ? "COALESCE(c.description, '')"
    : "''";

  return db.prepare(`
    SELECT
      c.id,
      c.name,
      ${descriptionExpr} AS description,
      c.status,
      ${confidenceExpr} AS confidence,
      COALESCE(cm.mastery_score, 0) AS masteryScore,
      COALESCE(cm.mastery_level, 'UNTESTED') AS masteryLevel
    FROM concepts c
    LEFT JOIN concept_mastery cm ON cm.concept_id = c.id
  `).all() as DbConceptRow[];
}

function loadAliases(db: Database.Database): DbAliasRow[] {
  const table = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name = 'concept_aliases'
    LIMIT 1
  `).get() as { name: string } | undefined;

  if (!table) return [];

  const columns = tableColumns(db, "concept_aliases");
  const confidenceExpr = columns.has("confidence_score")
    ? "COALESCE(confidence_score, 0.6)"
    : "0.6";

  return db.prepare(`
    SELECT
      concept_id AS conceptId,
      alias,
      ${confidenceExpr} AS confidence
    FROM concept_aliases
  `).all() as DbAliasRow[];
}

export function retrieveBestAlaiConcept(
  db: Database.Database,
  rawInput: string,
  explicitTopic?: string
): AlaiConceptRetrievalResult {
  const topic = normalizeAlaiTopic(explicitTopic) || normalizeAlaiTopic(rawInput);

  if (!topic) {
    return {
      found: false,
      score: 0,
      reason: "NO_TOPIC",
    };
  }

  const normalizedTopic = normalize(topic);
  const topicTokens = tokens(topic);

  const concepts = loadConcepts(db);
  const aliases = loadAliases(db);

  const aliasMap = new Map<string, DbAliasRow[]>();

  for (const alias of aliases) {
    const key = alias.conceptId;
    const list = aliasMap.get(key) || [];
    list.push(alias);
    aliasMap.set(key, list);
  }

  let best: AlaiConceptRetrievalResult = {
    found: false,
    score: 0,
    reason: "NO_MATCH",
  };

  for (const concept of concepts) {
    const conceptName = normalize(concept.name);
    const conceptDescription = normalize(concept.description || "");
    const conceptAliases = aliasMap.get(concept.id) || [];

    let score = 0;
    let reason = "";

    if (conceptName === normalizedTopic) {
      score += 100;
      reason = "EXACT_CONCEPT_NAME";
    } else if (conceptAliases.some((alias) => normalize(alias.alias) === normalizedTopic)) {
      score += 95;
      reason = "EXACT_ALIAS";
    } else {
      for (const alias of conceptAliases) {
        const aliasText = normalize(alias.alias);
        if (aliasText.includes(normalizedTopic) || normalizedTopic.includes(aliasText)) {
          score += 40 * Math.max(0.5, alias.confidence);
          reason = "PARTIAL_ALIAS";
        }
      }

      if (isSafePartialConceptNameMatch(conceptName, normalizedTopic)) {
        score += 35;
        reason = reason || "PARTIAL_CONCEPT_NAME";
      }

      for (const token of topicTokens) {
        if (conceptName.split(" ").includes(token)) score += 8;
        if (conceptDescription.includes(token)) score += 2;
      }
    }

    const statusBoost =
      concept.status === "CANONICAL" ? 8 :
      concept.status === "VERIFIED" ? 5 :
      concept.status === "PENDING" ? -8 :
      0;

    score += statusBoost;
    score += Math.min(5, Math.max(0, concept.confidence * 3));
    score += Math.min(5, Math.max(0, concept.masteryScore * 3));

    const threshold = reason.startsWith("EXACT") ? 70 : 48;

    if (score > best.score && score >= threshold) {
      best = {
        found: true,
        score: Number(score.toFixed(3)),
        reason,
        concept,
      };
    }
  }

  return best;
}

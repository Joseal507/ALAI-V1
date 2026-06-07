import Database from "better-sqlite3";

export interface QuestionConcept {
  id: string;
  name: string;
  status: string;
  confidenceScore: number;
}

export interface ReasoningEdge {
  fromId: string;
  toId: string;
  fromName: string;
  toName: string;
  relationType: string;
  description: string;
  confidenceScore: number;
}

export interface ReasoningPath {
  fromConcept: string;
  toConcept: string;
  steps: ReasoningEdge[];
  confidenceScore: number;
}

export interface QuestionReasoningContext {
  detectedConcepts: QuestionConcept[];
  reasoningPaths: ReasoningPath[];
  summary: string;
}

const STOPWORDS = new Set([
  "que", "qué", "quien", "quién", "cual", "cuál", "como", "cómo",
  "tiene", "relacion", "relación", "con", "de", "del", "la", "el",
  "los", "las", "un", "una", "y", "o", "en", "para", "sirve",
  "dime", "explica", "compara", "diferencia", "entre", "algo",
  "what", "who", "how", "why", "is", "are", "the", "with", "and",
]);

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ");
}

function tokens(value: string): string[] {
  return normalize(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

function overlapScore(question: string, target: string): number {
  const q = new Set(tokens(question));
  const t = tokens(target);

  if (t.length === 0) return 0;

  const matches = t.filter((token) => q.has(token)).length;
  return matches / t.length;
}

export function detectQuestionConcepts(
  db: Database.Database,
  question: string
): QuestionConcept[] {
  const normalizedQuestion = normalize(question);

  const rows = db.prepare(`
    SELECT
      concepts.id,
      concepts.name,
      concepts.status,
      concepts.confidence_score AS confidenceScore,
      concepts.description,
      GROUP_CONCAT(concept_aliases.alias, ' || ') AS aliases
    FROM concepts
    LEFT JOIN concept_aliases ON concept_aliases.concept_id = concepts.id
    GROUP BY concepts.id
  `).all() as {
    id: string;
    name: string;
    status: string;
    confidenceScore: number;
    description: string;
    aliases: string | null;
  }[];

  const scored = rows
    .map((concept) => {
      const name = normalize(concept.name);
      const aliases = normalize(concept.aliases || "");
      const description = normalize(concept.description || "");

      const exactNameMatch = Boolean(name && normalizedQuestion.includes(name));
      const exactAliasMatch = Boolean(aliases && normalizedQuestion.includes(aliases));

      let score = 0;

      if (exactNameMatch) score += 1.5;
      if (exactAliasMatch) score += 1.1;

      score += overlapScore(question, concept.name) * 0.75;
      score += overlapScore(question, concept.aliases || "") * 0.65;
      score += Math.min(overlapScore(question, concept.description || "") * 0.25, 0.25);
      score += Math.min(concept.confidenceScore * 0.12, 0.12);

      return {
        id: concept.id,
        name: concept.name,
        status: concept.status,
        confidenceScore: concept.confidenceScore,
        score,
        exactMatch: exactNameMatch || exactAliasMatch,
        questionIndex: exactNameMatch ? normalizedQuestion.indexOf(name) : 99999,
      };
    })
    .filter((concept) => concept.score >= 0.32);

  const exactMatchesRaw = scored
    .filter((concept) => concept.exactMatch)
    .sort((a, b) => {
      const nameLengthDiff = normalize(b.name).length - normalize(a.name).length;
      return nameLengthDiff || a.questionIndex - b.questionIndex || b.score - a.score;
    });

  const exactMatches = exactMatchesRaw.filter((candidate, index, all) => {
    const candidateName = normalize(candidate.name);

    return !all.some((other, otherIndex) => {
      if (otherIndex === index) return false;

      const otherName = normalize(other.name);

      return (
        otherName.length > candidateName.length &&
        otherName.includes(candidateName)
      );
    });
  });

  const selected =
    exactMatches.length > 0
      ? exactMatches.sort((a, b) => a.questionIndex - b.questionIndex || b.score - a.score)
      : scored.sort((a, b) => b.score - a.score);

  return selected
    .slice(0, exactMatches.length > 0 ? Math.max(1, exactMatches.length) : 10)
    .map(({ score, exactMatch, questionIndex, ...concept }) => concept);
}

function getGraphEdges(db: Database.Database): ReasoningEdge[] {
  return db.prepare(`
    SELECT
      relations.from_concept_id AS fromId,
      relations.to_concept_id AS toId,
      source.name AS fromName,
      target.name AS toName,
      relations.relation_type AS relationType,
      relations.description,
      relations.confidence_score AS confidenceScore
    FROM relations
    JOIN concepts AS source ON source.id = relations.from_concept_id
    JOIN concepts AS target ON target.id = relations.to_concept_id
    ORDER BY relations.confidence_score DESC
  `).all() as ReasoningEdge[];
}

function buildAdjacency(edges: ReasoningEdge[]): Map<string, ReasoningEdge[]> {
  const adjacency = new Map<string, ReasoningEdge[]>();

  for (const edge of edges) {
    if (!adjacency.has(edge.fromId)) adjacency.set(edge.fromId, []);
    adjacency.get(edge.fromId)!.push(edge);

    const reverse: ReasoningEdge = {
      ...edge,
      fromId: edge.toId,
      toId: edge.fromId,
      fromName: edge.toName,
      toName: edge.fromName,
      relationType: `REVERSE_${edge.relationType}`,
      description: `Reverse path: ${edge.description}`,
    };

    if (!adjacency.has(reverse.fromId)) adjacency.set(reverse.fromId, []);
    adjacency.get(reverse.fromId)!.push(reverse);
  }

  for (const [key, list] of adjacency.entries()) {
    adjacency.set(
      key,
      list.sort((a, b) => b.confidenceScore - a.confidenceScore)
    );
  }

  return adjacency;
}

function findTopPaths(
  adjacency: Map<string, ReasoningEdge[]>,
  from: QuestionConcept,
  to: QuestionConcept,
  maxDepth = 4,
  maxPaths = 5
): ReasoningEdge[][] {
  type State = {
    conceptId: string;
    path: ReasoningEdge[];
    visited: Set<string>;
  };

  const results: ReasoningEdge[][] = [];
  const queue: State[] = [
    {
      conceptId: from.id,
      path: [],
      visited: new Set([from.id]),
    },
  ];

  while (queue.length > 0 && results.length < maxPaths * 3) {
    const current = queue.shift()!;

    if (current.conceptId === to.id && current.path.length > 0) {
      results.push(current.path);
      continue;
    }

    if (current.path.length >= maxDepth) continue;

    for (const edge of adjacency.get(current.conceptId) ?? []) {
      if (current.visited.has(edge.toId)) continue;

      queue.push({
        conceptId: edge.toId,
        path: [...current.path, edge],
        visited: new Set([...current.visited, edge.toId]),
      });
    }
  }

  return results
    .sort((a, b) => calculateRawPathScore(b) - calculateRawPathScore(a))
    .slice(0, maxPaths);
}

function relationTypeWeight(type: string): number {
  const normalized = type.replace(/^REVERSE_/, "").toUpperCase();

  if (normalized === "IS_A") return 0.95;
  if (normalized === "PART_OF") return 0.92;
  if (normalized === "DEPENDS_ON") return 0.9;
  if (normalized === "USED_FOR") return 0.88;
  if (normalized === "USES") return 0.88;
  if (normalized === "EXPLAINS") return 0.86;
  if (normalized === "DEFINES") return 0.86;
  if (normalized === "RELATED_TO") return 0.75;
  if (normalized === "CHANGES") return 0.78;
  if (normalized === "FORMULA_RELATION") return 0.8;

  return 0.65;
}

function calculateRawPathScore(path: ReasoningEdge[]): number {
  if (path.length === 0) return 0;

  const avgEdge =
    path.reduce((sum, edge) => sum + edge.confidenceScore, 0) / path.length;

  const avgType =
    path.reduce((sum, edge) => sum + relationTypeWeight(edge.relationType), 0) / path.length;

  const depthPenalty = Math.max(0, (path.length - 1) * 0.1);

  return Math.max(0, avgEdge * 0.62 + avgType * 0.38 - depthPenalty);
}

function calculatePathConfidence(
  from: QuestionConcept,
  to: QuestionConcept,
  path: ReasoningEdge[]
): number {
  if (path.length === 0) return 0;

  const raw = calculateRawPathScore(path);
  const conceptConfidence = (from.confidenceScore + to.confidenceScore) / 2;
  const directBonus = path.length === 1 ? 0.06 : path.length === 2 ? 0.03 : 0;
  const lengthPenalty = Math.max(0, (path.length - 1) * 0.04);

  return Math.min(
    0.94,
    Math.max(0, raw * 0.68 + conceptConfidence * 0.24 + directBonus - lengthPenalty)
  );
}


function isWeakSharedCurriculumPath(path: ReasoningPath): boolean {
  if (path.steps.length === 0) return false;

  return path.steps.every((step) => {
    const type = step.relationType.replace(/^REVERSE_/, "").toUpperCase();
    const description = step.description.toLowerCase();

    return (
      type === "RELATED_TO" &&
      description.includes("shared curriculum topics")
    );
  });
}

function hasOnlyOneExplicitQuestionConcept(
  detectedConcepts: QuestionConcept[],
  question: string
): boolean {
  const normalizedQuestion = question.toLowerCase();

  const explicit = detectedConcepts.filter((concept) =>
    normalizedQuestion.includes(concept.name.toLowerCase())
  );

  return explicit.length <= 1;
}

export function reasonAboutQuestion(
  db: Database.Database,
  question: string
): QuestionReasoningContext {
  const detectedConcepts = detectQuestionConcepts(db, question);
  const edges = getGraphEdges(db);
  const adjacency = buildAdjacency(edges);
  const reasoningPaths: ReasoningPath[] = [];

  for (let i = 0; i < detectedConcepts.length; i++) {
    for (let j = i + 1; j < detectedConcepts.length; j++) {
      const from = detectedConcepts[i];
      const to = detectedConcepts[j];

      for (const path of findTopPaths(adjacency, from, to)) {
        reasoningPaths.push({
          fromConcept: from.name,
          toConcept: to.name,
          steps: path,
          confidenceScore: calculatePathConfidence(from, to, path),
        });
      }

      for (const path of findTopPaths(adjacency, to, from)) {
        reasoningPaths.push({
          fromConcept: to.name,
          toConcept: from.name,
          steps: path,
          confidenceScore: calculatePathConfidence(to, from, path),
        });
      }
    }
  }

  const summaryLines: string[] = [];

  if (detectedConcepts.length > 0) {
    summaryLines.push(
      `Detected concepts: ${detectedConcepts.map((concept) => concept.name).join(", ")}.`
    );
  } else {
    summaryLines.push("No matching internal concepts detected.");
  }

  if (reasoningPaths.length > 0) {
    summaryLines.push(`Found ${reasoningPaths.length} graph reasoning path(s).`);
  } else {
    summaryLines.push("No graph reasoning path found between detected concepts.");
  }

  const primaryConcepts = detectedConcepts.slice(0, 2).map((concept) => concept.name.toLowerCase());

  const filteredPaths = reasoningPaths.filter((path) => {
    if (primaryConcepts.length < 2) return true;

    const from = path.fromConcept.toLowerCase();
    const to = path.toConcept.toLowerCase();

    return (
      (from === primaryConcepts[0] && to === primaryConcepts[1]) ||
      (from === primaryConcepts[1] && to === primaryConcepts[0])
    );
  });

  const candidatePaths = filteredPaths.length > 0 ? filteredPaths : reasoningPaths;

  const finalPaths = hasOnlyOneExplicitQuestionConcept(detectedConcepts, question)
    ? candidatePaths.filter((path) => !isWeakSharedCurriculumPath(path))
    : candidatePaths;

  return {
    detectedConcepts,
    reasoningPaths: (finalPaths.length > 0 ? finalPaths : [])
      .sort((a, b) => b.confidenceScore - a.confidenceScore)
      .slice(0, 8),
    summary: summaryLines.join(" "),
  };
}

export function buildQuestionReasoningContext(
  context: QuestionReasoningContext
): string {
  const parts: string[] = [];

  parts.push("GRAPH QUESTION REASONING:");
  parts.push(context.summary);

  if (context.detectedConcepts.length > 0) {
    parts.push("\nDETECTED CONCEPTS:");

    for (const concept of context.detectedConcepts) {
      parts.push(
        `- ${concept.name} (${concept.status}, confidence=${concept.confidenceScore})`
      );
    }
  }

  if (context.reasoningPaths.length > 0) {
    parts.push("\nREASONING PATHS:");

    for (const path of context.reasoningPaths) {
      parts.push(
        `- ${path.fromConcept} -> ${path.toConcept} ` +
        `(path confidence=${path.confidenceScore.toFixed(4)})`
      );

      for (const [index, step] of path.steps.entries()) {
        parts.push(
          `  ${index + 1}. ${step.fromName} --${step.relationType}--> ${step.toName}: ` +
          `${step.description} (relation confidence=${step.confidenceScore})`
        );
      }
    }
  }

  return parts.join("\n");
}

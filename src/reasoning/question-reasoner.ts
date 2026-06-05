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

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function detectQuestionConcepts(
  db: Database.Database,
  question: string
): QuestionConcept[] {
  const normalizedQuestion = normalize(question);

  const concepts = db.prepare(`
    SELECT DISTINCT
      concepts.id,
      concepts.name,
      concepts.status,
      concepts.confidence_score AS confidenceScore
    FROM concepts
    LEFT JOIN concept_aliases ON concept_aliases.concept_id = concepts.id
    WHERE lower(?) LIKE '%' || lower(concepts.name) || '%'
       OR (
         concept_aliases.alias IS NOT NULL
         AND lower(?) LIKE '%' || lower(concept_aliases.alias) || '%'
       )
    ORDER BY
      concepts.confidence_score DESC,
      length(concepts.name) DESC
    LIMIT 8
  `).all(normalizedQuestion, normalizedQuestion) as QuestionConcept[];

  return concepts;
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

  return adjacency;
}

function findPath(
  adjacency: Map<string, ReasoningEdge[]>,
  from: QuestionConcept,
  to: QuestionConcept,
  maxDepth = 4
): ReasoningEdge[] | null {
  type State = {
    conceptId: string;
    path: ReasoningEdge[];
    visited: Set<string>;
  };

  const queue: State[] = [
    {
      conceptId: from.id,
      path: [],
      visited: new Set([from.id]),
    },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current.conceptId === to.id) {
      return current.path;
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

  return null;
}

function calculatePathConfidence(
  from: QuestionConcept,
  to: QuestionConcept,
  path: ReasoningEdge[]
): number {
  if (path.length === 0) return 0;

  const relationConfidence = path.reduce(
    (score, edge) => score * edge.confidenceScore,
    1
  );

  return relationConfidence * Math.min(from.confidenceScore, to.confidenceScore);
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

      const forward = findPath(adjacency, from, to);
      if (forward) {
        reasoningPaths.push({
          fromConcept: from.name,
          toConcept: to.name,
          steps: forward,
          confidenceScore: calculatePathConfidence(from, to, forward),
        });
      }

      const reverse = findPath(adjacency, to, from);
      if (reverse) {
        reasoningPaths.push({
          fromConcept: to.name,
          toConcept: from.name,
          steps: reverse,
          confidenceScore: calculatePathConfidence(to, from, reverse),
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

  return {
    detectedConcepts,
    reasoningPaths: reasoningPaths
      .sort((a, b) => b.confidenceScore - a.confidenceScore)
      .slice(0, 6),
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

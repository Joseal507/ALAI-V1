import Database from "better-sqlite3";

const db = new Database("data/alai.db");

const fromQuery = process.argv[2];
const toQuery = process.argv[3];

if (!fromQuery || !toQuery) {
  console.error('Usage: npm run graph:explain -- "Angular Momentum" "Rigid Body Dynamics"');
  process.exit(1);
}

type Concept = {
  id: string;
  name: string;
  status: string;
  confidenceScore: number;
};

type Edge = {
  fromId: string;
  toId: string;
  fromName: string;
  toName: string;
  relationType: string;
  description: string;
  confidenceScore: number;
};

function findConcept(query: string): Concept | undefined {
  return db.prepare(`
    SELECT
      id,
      name,
      status,
      confidence_score AS confidenceScore
    FROM concepts
    WHERE lower(name) = lower(?)
       OR lower(name) LIKE '%' || lower(?) || '%'
    ORDER BY
      CASE WHEN lower(name) = lower(?) THEN 0 ELSE 1 END,
      length(name) ASC
    LIMIT 1
  `).get(query, query, query) as Concept | undefined;
}

const start = findConcept(fromQuery);
const goal = findConcept(toQuery);

if (!start) {
  console.error(`Concept not found: ${fromQuery}`);
  process.exit(1);
}

if (!goal) {
  console.error(`Concept not found: ${toQuery}`);
  process.exit(1);
}

const edges = db.prepare(`
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
`).all() as Edge[];

const adjacency = new Map<string, Edge[]>();

for (const edge of edges) {
  if (!adjacency.has(edge.fromId)) adjacency.set(edge.fromId, []);
  adjacency.get(edge.fromId)!.push(edge);

  const reverse: Edge = {
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

type PathState = {
  conceptId: string;
  path: Edge[];
};

const queue: PathState[] = [{ conceptId: start.id, path: [] }];
const visited = new Set<string>([start.id]);
let foundPath: Edge[] | null = null;

while (queue.length > 0) {
  const current = queue.shift()!;

  if (current.conceptId === goal.id) {
    foundPath = current.path;
    break;
  }

  if (current.path.length >= 4) continue;

  for (const edge of adjacency.get(current.conceptId) ?? []) {
    if (visited.has(edge.toId)) continue;

    visited.add(edge.toId);
    queue.push({
      conceptId: edge.toId,
      path: [...current.path, edge],
    });
  }
}

console.log("\n=== ALAI Graph Explanation ===");
console.log({
  from: start.name,
  to: goal.name,
  fromStatus: start.status,
  toStatus: goal.status,
});

if (!foundPath) {
  console.log("\nNo reasoning path found within 4 steps.");
  process.exit(0);
}

const pathConfidence =
  foundPath.reduce((score, edge) => score * edge.confidenceScore, 1) *
  Math.min(start.confidenceScore, goal.confidenceScore);

console.log("\nReasoning path:");
for (const [index, edge] of foundPath.entries()) {
  console.log(`${index + 1}. ${edge.fromName} --${edge.relationType}--> ${edge.toName}`);
  console.log(`   ${edge.description}`);
  console.log(`   relation confidence: ${edge.confidenceScore}`);
}

console.log("\nConclusion:");
console.log(
  `${start.name} is connected to ${goal.name} through ${foundPath.length} graph step(s).`
);
console.log(`Estimated path confidence: ${pathConfidence.toFixed(4)}`);

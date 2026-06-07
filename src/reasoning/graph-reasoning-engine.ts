import Database from "better-sqlite3";

export interface InferredRelation {
  fromConceptId: string;
  toConceptId: string;
  relationType:
    | "INDIRECTLY_DEPENDS_ON"
    | "CONTRIBUTES_TO";
  description: string;
  confidenceScore: number;
}

interface RelationRow {
  fromConceptId: string;
  fromName: string;
  toConceptId: string;
  toName: string;
  relationType: string;
}

export function inferGraphRelations(db: Database.Database): InferredRelation[] {
  const rows = db.prepare(`
    SELECT
      source.id AS fromConceptId,
      source.name AS fromName,
      target.id AS toConceptId,
      target.name AS toName,
      relations.relation_type AS relationType
    FROM relations
    JOIN concepts AS source ON source.id = relations.from_concept_id
    JOIN concepts AS target ON target.id = relations.to_concept_id
  `).all() as RelationRow[];

  const inferred: InferredRelation[] = [];

  for (const first of rows) {
    for (const second of rows) {
      if (first.toConceptId !== second.fromConceptId) continue;
      if (first.fromConceptId === second.toConceptId) continue;

      if (
        first.relationType === "DEPENDS_ON" &&
        second.relationType === "DEPENDS_ON"
      ) {
        inferred.push({
          fromConceptId: first.fromConceptId,
          toConceptId: second.toConceptId,
          relationType: "INDIRECTLY_DEPENDS_ON",
          description: `${first.fromName} indirectly depends on ${second.toName} through ${first.toName}.`,
          confidenceScore: 0.28,
        });
      }

      if (
        first.relationType === "CAUSES" &&
        (
          second.relationType === "RELATED_TO" ||
          second.relationType === "DEPENDS_ON"
        )
      ) {
        inferred.push({
          fromConceptId: first.fromConceptId,
          toConceptId: second.toConceptId,
          relationType: "CONTRIBUTES_TO",
          description: `${first.fromName} may contribute to ${second.toName} through ${first.toName}.`,
          confidenceScore: 0.25,
        });
      }

    }
  }

  return dedupeInferences(inferred);
}

function dedupeInferences(items: InferredRelation[]): InferredRelation[] {
  const seen = new Set<string>();
  const result: InferredRelation[] = [];

  for (const item of items) {
    const key = `${item.fromConceptId}:${item.toConceptId}:${item.relationType}`;

    if (seen.has(key)) continue;

    seen.add(key);
    result.push(item);
  }

  return result;
}

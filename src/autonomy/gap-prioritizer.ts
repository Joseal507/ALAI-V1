import Database from "better-sqlite3";

export interface KnowledgeGap {
  id: string;
  conceptId: string | null;
  conceptName: string | null;
  gapDescription: string;
  priorityScore: number;
  status: string;
  createdAt: string;
}

export function getPrioritizedOpenGaps(
  db: Database.Database,
  limit = 5
): KnowledgeGap[] {
  return db.prepare(`
    SELECT
      knowledge_gaps.id,
      knowledge_gaps.concept_id AS conceptId,
      concepts.name AS conceptName,
      knowledge_gaps.gap_description AS gapDescription,
      knowledge_gaps.priority_score AS priorityScore,
      knowledge_gaps.status,
      knowledge_gaps.created_at AS createdAt
    FROM knowledge_gaps
    LEFT JOIN concepts ON concepts.id = knowledge_gaps.concept_id
    WHERE knowledge_gaps.status = 'OPEN'
    ORDER BY knowledge_gaps.priority_score DESC, knowledge_gaps.created_at ASC
    LIMIT ?
  `).all(limit) as KnowledgeGap[];
}

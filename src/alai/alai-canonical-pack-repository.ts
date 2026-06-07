import Database from "better-sqlite3";

export function getCanonicalPack(
  db: Database.Database,
  conceptId: string
) {
  return db.prepare(`
    SELECT *
    FROM canonical_concept_packs
    WHERE concept_id = ?
    LIMIT 1
  `).get(conceptId);
}

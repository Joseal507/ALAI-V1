import Database from "better-sqlite3";

const db = new Database("data/alai.db");

const duplicateLinks = db.prepare(`
  DELETE FROM concept_evidence_links
  WHERE rowid NOT IN (
    SELECT MIN(rowid)
    FROM concept_evidence_links
    GROUP BY concept_id, evidence_id
  )
`).run();

const excessiveLinks = db.prepare(`
  DELETE FROM concept_evidence_links
  WHERE rowid IN (
    SELECT cel.rowid
    FROM concept_evidence_links cel
    WHERE (
      SELECT COUNT(*)
      FROM concept_evidence_links cel2
      WHERE cel2.concept_id = cel.concept_id
        AND cel2.rowid <= cel.rowid
    ) > 12
  )
`).run();

console.log("ALAI evidence deduper completed.");
console.log({
  duplicateLinksRemoved: duplicateLinks.changes,
  excessiveLinksRemoved: excessiveLinks.changes,
});

import Database from "better-sqlite3";
import crypto from "node:crypto";
import { extractConceptsFromText } from "../src/learning/learning-extractor";

async function main() {
  const db = new Database("data/alai.db");

  const rows = db.prepare(`
    SELECT id, source_name, content_summary
    FROM evidence
    ORDER BY captured_at DESC
    LIMIT 5
  `).all() as {
    id: string;
    source_name: string;
    content_summary: string;
  }[];

  let inserted = 0;
  let skipped = 0;

  for (const row of rows) {
    const extraction = await extractConceptsFromText(
      `${row.source_name}\n${row.content_summary}`
    );

    for (const concept of extraction.concepts) {
      const existing = db.prepare(`
        SELECT id FROM concepts
        WHERE lower(name) = lower(?)
        LIMIT 1
      `).get(concept.name) as { id: string } | undefined;

      if (existing) {
        skipped++;
        continue;
      }

      const now = new Date().toISOString();
      const conceptId = crypto.randomUUID();

      db.prepare(`
        INSERT INTO concepts (
          id,
          name,
          description,
          status,
          confidence_score,
          uncertainty_score,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        conceptId,
        concept.name,
        concept.description,
        "PENDING",
        0.35,
        0.65,
        now,
        now
      );

      db.prepare(`
        INSERT OR IGNORE INTO concept_evidence (
          concept_id,
          evidence_id
        ) VALUES (?, ?)
      `).run(conceptId, row.id);

      for (const alias of concept.aliases || []) {
        db.prepare(`
          INSERT INTO concept_aliases (
            id,
            concept_id,
            alias,
            created_at
          ) VALUES (?, ?, ?, ?)
        `).run(
          crypto.randomUUID(),
          conceptId,
          alias,
          now
        );
      }

      inserted++;
    }
  }

  console.log("Learning from evidence completed.");
  console.log({ inserted, skipped });
}

main().catch((error) => {
  console.error("Learning from evidence failed:");
  console.error(error);
  process.exit(1);
});

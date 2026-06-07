import Database from "better-sqlite3";
import { rankConcept } from "../src/learning/concept-rank-engine";

const db = new Database("data/alai.db");

const concepts = db.prepare(`
  SELECT id, name, description, status
  FROM concepts
`).all() as {
  id: string;
  name: string;
  description: string;
  status: string;
}[];

const deleteNoiseConcept = db.transaction((conceptId: string) => {
  db.prepare(`
    DELETE FROM relations
    WHERE from_concept_id = ?
       OR to_concept_id = ?
  `).run(conceptId, conceptId);

  db.prepare(`
    DELETE FROM alai_question_answers
    WHERE question_id IN (
      SELECT id FROM alai_self_questions WHERE concept_id = ?
    )
  `).run(conceptId);

  db.prepare(`DELETE FROM alai_self_questions WHERE concept_id = ?`).run(conceptId);
  db.prepare(`DELETE FROM alai_mastery_validations WHERE concept_id = ?`).run(conceptId);

  db.prepare(`DELETE FROM concept_evidence WHERE concept_id = ?`).run(conceptId);
  db.prepare(`DELETE FROM concept_evidence_links WHERE concept_id = ?`).run(conceptId);
  db.prepare(`DELETE FROM concept_mastery WHERE concept_id = ?`).run(conceptId);
  db.prepare(`DELETE FROM topic_concepts WHERE concept_id = ?`).run(conceptId);

  db.prepare(`DELETE FROM alai_autonomous_exams WHERE concept_id = ?`).run(conceptId);
  db.prepare(`DELETE FROM alai_concept_competencies WHERE concept_id = ?`).run(conceptId);
  db.prepare(`DELETE FROM alai_concept_self_tests WHERE concept_id = ?`).run(conceptId);
  db.prepare(`DELETE FROM alai_evidence_grounded_exams WHERE concept_id = ?`).run(conceptId);
  db.prepare(`DELETE FROM concept_stage_flags WHERE concept_id = ?`).run(conceptId);
  db.prepare(`DELETE FROM common_errors WHERE concept_id = ?`).run(conceptId);

  db.prepare(`
    DELETE FROM concept_prerequisites
    WHERE concept_id = ?
       OR prerequisite_concept_id = ?
  `).run(conceptId, conceptId);

  db.prepare(`DELETE FROM capabilities WHERE concept_id = ?`).run(conceptId);
  db.prepare(`DELETE FROM concept_aliases WHERE concept_id = ?`).run(conceptId);
  db.prepare(`DELETE FROM knowledge_gaps WHERE concept_id = ?`).run(conceptId);

  db.prepare(`DELETE FROM concepts WHERE id = ?`).run(conceptId);
});

let deleted = 0;
let skipped = 0;

for (const concept of concepts) {
  const rank = rankConcept(concept.name, concept.description);

  if (rank !== "NOISE") {
    skipped++;
    continue;
  }

  deleteNoiseConcept(concept.id);

  deleted++;
  console.log("Deleted noise concept:", concept.name);
}

console.log("Noise concept pruning completed.");
console.log({ deleted, skipped });

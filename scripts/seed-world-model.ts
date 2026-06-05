import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");

const now = new Date().toISOString();

const torqueId = crypto.randomUUID();
const forceId = crypto.randomUUID();
const relationId = crypto.randomUUID();

db.prepare(`
  INSERT INTO concepts (
    id, name, description, status, confidence_score, uncertainty_score, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  torqueId,
  "Torque",
  "Concepto físico relacionado con la capacidad de una fuerza para producir rotación alrededor de un eje.",
  "PENDING",
  0.4,
  0.6,
  now,
  now
);

db.prepare(`
  INSERT INTO concepts (
    id, name, description, status, confidence_score, uncertainty_score, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  forceId,
  "Fuerza",
  "Interacción capaz de cambiar el movimiento o estado de un cuerpo.",
  "PENDING",
  0.4,
  0.6,
  now,
  now
);

db.prepare(`
  INSERT INTO relations (
    id, from_concept_id, to_concept_id, relation_type, description, confidence_score, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  relationId,
  torqueId,
  forceId,
  "DEPENDS_ON",
  "El torque depende de la fuerza aplicada y de la distancia al eje de rotación.",
  0.4,
  now,
  now
);

console.log("Seed completed.");
console.log({ torqueId, forceId, relationId });

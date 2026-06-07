import Database from "better-sqlite3";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

const vector = db.prepare(`
  SELECT id
  FROM concepts
  WHERE lower(name) = lower('Vector')
  LIMIT 1
`).get() as { id: string } | undefined;

if (!vector) {
  console.log("Vector not found.");
  process.exit(0);
}

db.prepare(`
  UPDATE canonical_concept_packs
  SET
    short_summary = ?,
    technical_explanation = ?,
    canonical_example = ?,
    common_misconceptions = ?,
    practical_uses = ?,
    updated_at = ?
  WHERE concept_id = ?
`).run(
  "un vector representa una magnitud y una dirección; en álgebra lineal también puede verse como un elemento de un espacio vectorial.",
  "En álgebra lineal, un vector es un elemento de un espacio vectorial. Puede sumarse con otros vectores y multiplicarse por escalares, lo que permite representar cantidades como desplazamientos, fuerzas, velocidades o coordenadas.",
  "si una persona camina 3 metros hacia el este y 4 metros hacia el norte, ese desplazamiento puede representarse con un vector porque incluye magnitud y dirección.",
  "Un error común es pensar que un vector es solo una flecha. La flecha es una representación visual; matemáticamente, un vector también puede representarse con componentes numéricos.",
  "Los vectores se usan en física, ingeniería, geometría, programación gráfica, inteligencia artificial y álgebra lineal para representar direcciones, movimientos, fuerzas y datos.",
  now,
  vector.id
);

console.table(db.prepare(`
  SELECT short_summary, technical_explanation, canonical_example, common_misconceptions, practical_uses
  FROM canonical_concept_packs
  WHERE concept_id = ?
`).all(vector.id));

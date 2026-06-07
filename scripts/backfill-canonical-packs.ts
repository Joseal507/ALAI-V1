import Database from "better-sqlite3";
import { generateCanonicalPack, ensureCanonicalPackTable } from "../src/alai/alai-canonical-pack-generator";

const db = new Database("data/alai.db");
ensureCanonicalPackTable(db);

const concepts = db.prepare(`
SELECT id, name
FROM concepts
WHERE status IN ('VERIFIED','CANONICAL')
ORDER BY name
`).all() as { id: string; name: string }[];

for (const concept of concepts) {
  generateCanonicalPack(db, concept.id);
  console.log("PACK:", concept.name);
}

console.log("DONE");

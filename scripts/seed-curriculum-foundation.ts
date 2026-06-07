import Database from "better-sqlite3";
import crypto from "node:crypto";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

const levels = [
  ["preschool", 1, "Early childhood learning foundations."],
  ["primary", 2, "Basic literacy, numeracy, science, social and personal foundations."],
  ["premedia", 3, "Middle school bridge between primary and secondary education."],
  ["media", 4, "Upper secondary education and academic specialization foundations."],
  ["undergraduate", 5, "University bachelor-level education."],
  ["specialization", 6, "Postgraduate professional specialization."],
  ["master", 7, "Advanced graduate-level mastery."],
  ["doctorate", 8, "Research-level expert knowledge creation."],
];

const rootDomains = [
  "Mathematics",
  "Language",
  "Natural Sciences",
  "Social Sciences",
  "Technology",
  "Arts",
  "Physical Education",
  "Medicine",
  "Engineering",
  "Law",
  "Business",
  "Education",
  "Humanities",
];

function upsertLevel(name: string, order: number, description: string) {
  const existing = db.prepare(`SELECT id FROM education_levels WHERE name = ?`).get(name) as { id: string } | undefined;
  if (existing) return existing.id;

  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO education_levels (id, name, order_index, description, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, name, order, description, now, now);
  return id;
}

function upsertDomain(name: string) {
  const existing = db.prepare(`
    SELECT id FROM academic_domains
    WHERE lower(name) = lower(?) AND parent_domain_id IS NULL
    LIMIT 1
  `).get(name) as { id: string } | undefined;

  if (existing) return existing.id;

  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO academic_domains (
      id, name, parent_domain_id, description, depth, status, confidence_score, created_at, updated_at
    ) VALUES (?, ?, NULL, ?, 0, 'PENDING', 0.35, ?, ?)
  `).run(id, name, `Root academic domain for autonomous curriculum expansion: ${name}.`, now, now);

  return id;
}

function enqueue(objective: string, priority: number) {
  const existing = db.prepare(`
    SELECT id FROM autonomous_learning_queue
    WHERE objective = ? AND status IN ('OPEN', 'RUNNING')
    LIMIT 1
  `).get(objective) as { id: string } | undefined;

  if (existing) return false;

  db.prepare(`
    INSERT INTO autonomous_learning_queue (
      id, target_type, target_id, objective, priority_score, status, attempts, created_at, updated_at
    ) VALUES (?, 'CURRICULUM_EXPANSION', NULL, ?, ?, 'OPEN', 0, ?, ?)
  `).run(crypto.randomUUID(), objective, priority, now, now);

  return true;
}

let insertedLevels = 0;
let insertedDomains = 0;
let queued = 0;

for (const [name, order, description] of levels) {
  const before = db.prepare(`SELECT COUNT(*) AS count FROM education_levels WHERE name = ?`).get(name) as { count: number };
  upsertLevel(String(name), Number(order), String(description));
  if (before.count === 0) insertedLevels++;
}

for (const domain of rootDomains) {
  const before = db.prepare(`SELECT COUNT(*) AS count FROM academic_domains WHERE lower(name) = lower(?) AND parent_domain_id IS NULL`).get(domain) as { count: number };
  upsertDomain(domain);
  if (before.count === 0) insertedDomains++;

  if (enqueue(`Map the major branches, subbranches, topics, prerequisites, and core concepts of ${domain} across all education levels.`, 0.8)) {
    queued++;
  }
}

if (enqueue("Map the Panamanian education system levels, subjects, and progression structure.", 0.95)) queued++;
if (enqueue("Map universal education levels from preschool through doctorate, including subjects, disciplines, careers, and specializations.", 0.9)) queued++;

console.log("Curriculum foundation seeded.");
console.log({ insertedLevels, insertedDomains, queued });

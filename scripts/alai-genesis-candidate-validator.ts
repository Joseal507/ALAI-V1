import Database from "better-sqlite3";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

const bannedNamePatterns = [
  /jean piaget/i,
  /maria montessori/i,
  /wikipedia/i,
  /university/i,
  /college/i,
  /institute/i,
  /association/i,
  /organization/i,
];

const requiredTopicWords: Record<string, string[]> = {
  "Baby Foundations": [
    "baby",
    "infant",
    "early",
    "child",
    "development",
    "foundation",
    "learning",
    "motor",
    "language",
    "social",
    "sensory"
  ],
};

const rows = db.prepare(`
  SELECT
    cc.id,
    cc.name,
    cc.description,
    cc.curriculum_topic_id,
    ct.name AS topicName
  FROM candidate_concepts cc
  LEFT JOIN curriculum_topics ct ON ct.id = cc.curriculum_topic_id
  WHERE cc.status = 'PENDING'
`).all() as {
  id: string;
  name: string;
  description: string;
  curriculum_topic_id: string | null;
  topicName: string | null;
}[];

let accepted = 0;
let rejected = 0;

for (const row of rows) {
  const text = `${row.name} ${row.description}`.toLowerCase();
  const topicName = row.topicName ?? "";

  const banned = bannedNamePatterns.some((pattern) => pattern.test(row.name));
  const topicWords = requiredTopicWords[topicName] ?? [];
  const topicRelevant =
    topicWords.length === 0 ||
    topicWords.some((word) => text.includes(word));

  const genericBad =
    row.name.trim().split(/\s+/).length > 4 ||
    row.description.trim().length < 20;

  if (banned || !topicRelevant || genericBad) {
    db.prepare(`
      UPDATE candidate_concepts
      SET status = 'REJECTED',
          rejection_reason = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      banned
        ? "Rejected by Genesis validator: named person/institution/source is not a foundational concept."
        : !topicRelevant
          ? `Rejected by Genesis validator: concept is not relevant enough to topic "${topicName}".`
          : "Rejected by Genesis validator: concept is too generic or malformed.",
      now,
      row.id
    );

    rejected++;
    continue;
  }

  db.prepare(`
    UPDATE candidate_concepts
    SET quality_score = MAX(quality_score, 0.72),
        updated_at = ?
    WHERE id = ?
  `).run(now, row.id);

  accepted++;
}

console.log("ALAI Genesis candidate validator completed.");
console.log({ checked: rows.length, accepted, rejected });

console.table(db.prepare(`
  SELECT
    cc.name,
    ct.name AS topic,
    cc.quality_score AS quality,
    cc.status,
    cc.rejection_reason AS reason
  FROM candidate_concepts cc
  LEFT JOIN curriculum_topics ct ON ct.id = cc.curriculum_topic_id
  ORDER BY cc.updated_at DESC
  LIMIT 20
`).all());

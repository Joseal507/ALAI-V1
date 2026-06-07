import Database from "better-sqlite3";

const db = new Database("data/alai.db");
const now = new Date().toISOString();

const parentRules: Record<string, string> = {
  "Group Theory": "Abstract Algebra",
  "Vector Spaces": "Linear Algebra",
  "Linear Equations": "Elementary Algebra",
};

const findTopic = db.prepare(`
  SELECT id, name, parent_topic_id
  FROM curriculum_topics
  WHERE name = ?
  LIMIT 1
`);

const updateParent = db.prepare(`
  UPDATE curriculum_topics
  SET parent_topic_id = ?, updated_at = ?
  WHERE id = ?
`);

let updated = 0;
const applied: { topic: string; parent: string }[] = [];
const skipped: { topic: string; parent: string; reason: string }[] = [];

for (const [topicName, parentName] of Object.entries(parentRules)) {
  const topic = findTopic.get(topicName) as
    | { id: string; name: string; parent_topic_id: string | null }
    | undefined;

  const parent = findTopic.get(parentName) as
    | { id: string; name: string; parent_topic_id: string | null }
    | undefined;

  if (!topic) {
    skipped.push({ topic: topicName, parent: parentName, reason: "topic not found" });
    continue;
  }

  if (!parent) {
    skipped.push({ topic: topicName, parent: parentName, reason: "parent not found" });
    continue;
  }

  if (topic.id === parent.id) {
    skipped.push({ topic: topicName, parent: parentName, reason: "self-parent blocked" });
    continue;
  }

  if (topic.parent_topic_id === parent.id) {
    skipped.push({ topic: topicName, parent: parentName, reason: "already correct" });
    continue;
  }

  updateParent.run(parent.id, now, topic.id);
  updated++;
  applied.push({ topic: topicName, parent: parentName });
}

console.log("Curriculum hierarchy builder completed.");
console.log({ updated, applied, skipped });

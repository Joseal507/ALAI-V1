export type GovernanceDecision = {
  allowed: boolean;
  score: number;
  reason: string;
};

const BLOCKED_KEYWORDS = [
  "tax resistance",
  "animal abuse",
  "animal neglect",
  "cruelty",
  "identity politics",
];

const SENSITIVE_REVIEW_KEYWORDS = [
  "homosexual",
  "transgender",
  "race",
  "clinical trial",
  "antimicrobial resistance",
  "hunting",
];

const STRONG_CURRICULUM_ALLOW = [
  "basis",
  "span",
  "linear independence",
  "linear combination",
  "linear transformation",
  "linear algebra",
  "vector",
  "vector space",
  "scalar",
  "dimension",
  "matrix",
  "geometry",
  "angle",
  "angle measurement",
  "complementary angle",
  "shape",
  "arithmetic",
  "number",
  "numbers",
  "counting",
  "equation",
  "function",
  "fraction",
  "probability",
  "group",
  "group theory",
  "subgroup",
  "identity element",
  "inverse element",
  "operation",
  "associativity",
  "reading",
  "writing",
  "word",
  "words",
  "sentence",
  "grammar",
  "phonics",
  "spelling",
  "literacy",
  "basic arithmetic",
  "basic science",
  "primary education",
  "early childhood education",
  "infant development",
  "observational learning",
  "family",
  "emotion",
  "social skills",
  "body",
  "body parts",
  "animal",
  "color",
  "prime factorization",
  "fundamental theorem of arithmetic",
  "numeracy",
  "mathematical proof",
  "proof",
  "geometric measurement",
  "academic writing",
  "reading development",
  "writing development",
  "machine learning",
  "artificial intelligence",
  "explainable artificial intelligence",
  "binomial theorem",
  "matrices",
  "applied mathematics",
  "analysis",
  "abstract algebra",
  "statistics",
  "technology",
  "mathematics",
  "language",
  "history",
  "science",
];

const WORLD_KNOWLEDGE_ALLOW = [
  "albert einstein",
  "einstein",
  "theory of relativity",
  "relativity",
  "physics",
  "physicist",
  "scientist",
  "science",
  "neuroscience",
  "artificial general intelligence",
  "agi",
  "human intelligence",
  "human capabilities",
  "intelligence",
  "computer science",
  "philosophy",
  "baruch spinoza",
  "spinoza",
  "history",
  "biography",
  "person",
  "inventor",
  "researcher",
  "mathematician",
  "biology",
  "chemistry",
  "astronomy",
  "economics",
  "psychology",
  "sociology",
  "engineering",
];

const SOFT_ALLOW = [
  "math",
  "mathematics",
  "algebra",
  "geometric",
  "educational",
  "education",
  "learning",
  "curriculum",
  "foundational",
  "primary",
  "language",
  "science",
  "measurement",
  "knowledge",
  "concept",
  "theory",
  "model",
  "system",
  "method",
  "research",
];

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function hasAny(text: string, items: string[]): string | null {
  for (const item of items) {
    if (text.includes(normalize(item))) return item;
  }

  return null;
}

function looksLikeNamedEntity(name: string): boolean {
  const trimmed = name.trim();

  if (!trimmed.includes(" ")) return false;

  const words = trimmed
    .split(/\s+/)
    .filter(Boolean);

  if (words.length < 2 || words.length > 5) return false;

  return words.every((word) => /^[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ'-]+$/.test(word));
}

export function evaluateAutonomousLearningTarget(input: {
  name: string;
  description?: string;
}): GovernanceDecision {
  const rawName = input.name || "";
  const name = normalize(rawName);
  const text = normalize(`${input.name} ${input.description || ""}`);

  if (!name || name.length < 3) {
    return { allowed: false, score: 0, reason: "EMPTY_OR_TOO_SHORT" };
  }

  const blocked = hasAny(text, BLOCKED_KEYWORDS);
  if (blocked) {
    return { allowed: false, score: 0.05, reason: `BLOCKED_DOMAIN:${blocked}` };
  }

  const sensitive = hasAny(text, SENSITIVE_REVIEW_KEYWORDS);
  if (sensitive) {
    return {
      allowed: true,
      score: 0.45,
      reason: `ALLOWED_WITH_LOW_CONFIDENCE_REVIEW:${sensitive}`,
    };
  }

  const curriculum = hasAny(text, STRONG_CURRICULUM_ALLOW);
  if (curriculum) {
    return {
      allowed: true,
      score: 0.9,
      reason: `STRONG_CURRICULUM_MATCH:${curriculum}`,
    };
  }

  const world = hasAny(text, WORLD_KNOWLEDGE_ALLOW);
  if (world) {
    return {
      allowed: true,
      score: 0.78,
      reason: `WORLD_KNOWLEDGE_MATCH:${world}`,
    };
  }

  if (looksLikeNamedEntity(rawName)) {
    return {
      allowed: true,
      score: 0.62,
      reason: "WORLD_KNOWLEDGE_NAMED_ENTITY",
    };
  }

  let score = 0.25;

  for (const keyword of SOFT_ALLOW) {
    if (text.includes(normalize(keyword))) score += 0.18;
  }

  score = Math.min(1, score);

  if (score < 0.43) {
    return {
      allowed: true,
      score: 0.43,
      reason: "WORLD_KNOWLEDGE_PROVISIONAL",
    };
  }

  return { allowed: true, score, reason: "GENERAL_KNOWLEDGE_ALIGNED" };
}

import type { ResearchSource } from "../research/research-engine";

export type KnowledgeSafetyDecision = {
  allowLearning: boolean;
  allowAnswer: boolean;
  confidenceMultiplier: number;
  reason: string;
  usefulSources: ResearchSource[];
  warnings: string[];
};

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function topicTerms(topic: string): string[] {
  return normalize(topic)
    .split(/\s+/)
    .filter((term) => term.length >= 3)
    .filter((term) => ![
      "que",
      "con",
      "para",
      "una",
      "uno",
      "los",
      "las",
      "del",
      "definition",
      "explanation",
      "examples",
      "biology",
      "mathematics",
      "education",
    ].includes(term));
}

function sourceScore(source: ResearchSource, topic: string): number {
  const title = normalize(source.title);
  const snippet = normalize(source.snippet);
  const text = `${title} ${snippet}`;
  const terms = topicTerms(topic);

  let score = 0;

  for (const term of terms) {
    if (title.includes(term)) score += 5;
    if (snippet.includes(term)) score += 2;
  }

  if ((source.score || 0) >= 80) score += 4;
  if (title === normalize(topic)) score += 10;

  const badSignals = [
    "politics",
    "political",
    "election",
    "affordable care act",
    "sat",
    "identity politics",
    "hoarding",
    "homosexual behavior",
  ];

  for (const bad of badSignals) {
    if (text.includes(bad) && !normalize(topic).includes(bad)) {
      score -= 10;
    }
  }

  return score;
}

export function evaluateKnowledgeSafety(params: {
  topic: string;
  sources: ResearchSource[];
  memoryMode?: string;
}): KnowledgeSafetyDecision {
  const warnings: string[] = [];
  const topic = params.topic.trim();

  if (!topic) {
    return {
      allowLearning: false,
      allowAnswer: false,
      confidenceMultiplier: 0.2,
      reason: "NO_TOPIC",
      usefulSources: [],
      warnings: ["No topic was available for safety evaluation."],
    };
  }

  if (params.sources.length === 0) {
    return {
      allowLearning: false,
      allowAnswer: true,
      confidenceMultiplier: 0.45,
      reason: "NO_RESEARCH_SOURCES",
      usefulSources: [],
      warnings: ["No sources were returned."],
    };
  }

  const scored = params.sources
    .map((source) => ({
      source,
      score: sourceScore(source, topic),
    }))
    .sort((a, b) => b.score - a.score);

  const usefulSources = scored
    .filter((item) => item.score >= 5)
    .map((item) => item.source);

  if (usefulSources.length === 0) {
    return {
      allowLearning: false,
      allowAnswer: true,
      confidenceMultiplier: 0.45,
      reason: "NO_TOPIC_MATCHING_SOURCES",
      usefulSources: [],
      warnings: ["Sources did not match the topic strongly enough."],
    };
  }

  if (usefulSources.length < 2) {
    warnings.push("Only one useful source matched the topic.");
    return {
      allowLearning: false,
      allowAnswer: true,
      confidenceMultiplier: 0.65,
      reason: "INSUFFICIENT_SOURCE_COUNT_FOR_LEARNING",
      usefulSources,
      warnings,
    };
  }

  const topScore = scored[0]?.score || 0;

  if (topScore < 8) {
    warnings.push("Top source score was weak.");
    return {
      allowLearning: false,
      allowAnswer: true,
      confidenceMultiplier: 0.6,
      reason: "WEAK_SOURCE_MATCH",
      usefulSources,
      warnings,
    };
  }

  return {
    allowLearning: true,
    allowAnswer: true,
    confidenceMultiplier: 1,
    reason: "SAFE_TO_LEARN",
    usefulSources,
    warnings,
  };
}

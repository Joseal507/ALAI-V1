import type { KnowledgeGap } from "./gap-prioritizer";

export interface LearningTask {
  gapId: string;
  objective: string;
  searchQuery: string;
  reason: string;
  lockSearchQuery: boolean;
}

export function createLearningTaskFromGap(gap: KnowledgeGap): LearningTask {
  const objective = gap.conceptName
    ? `${gap.conceptName}: ${gap.gapDescription}`
    : gap.gapDescription;

  const normalized = objective.toLowerCase();

  if (
    normalized.includes("torque") &&
    normalized.includes("momento angular")
  ) {
    return {
      gapId: gap.id,
      objective,
      searchQuery:
        "torque angular momentum relation dL/dt rotational dynamics",
      reason:
        "Detected physics gap about torque and angular momentum; using canonical equation-focused query.",
      lockSearchQuery: true,
    };
  }

  return {
    gapId: gap.id,
    objective,
    searchQuery: objective,
    reason: "Created from highest-priority open knowledge gap.",
    lockSearchQuery: false,
  };
}

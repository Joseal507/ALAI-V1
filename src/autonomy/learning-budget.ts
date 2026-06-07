export type LearningBudget = {
  maxNewConcepts: number;
  maxNewRelations: number;
  conceptsInserted: number;
  relationsInserted: number;
};

export function createLearningBudget(): LearningBudget {
  return {
    maxNewConcepts: Number(process.env.ALAI_MAX_NEW_CONCEPTS_PER_RUN || 5),
    maxNewRelations: Number(process.env.ALAI_MAX_NEW_RELATIONS_PER_RUN || 15),
    conceptsInserted: 0,
    relationsInserted: 0,
  };
}

export function canInsertConcept(budget: LearningBudget): boolean {
  return budget.conceptsInserted < budget.maxNewConcepts;
}

export function canInsertRelation(budget: LearningBudget): boolean {
  return budget.relationsInserted < budget.maxNewRelations;
}

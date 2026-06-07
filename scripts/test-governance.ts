import { evaluateAutonomousLearningTarget } from "../src/autonomy/governance-brain";

for (const name of [
  "Albert Einstein",
  "Theory of Relativity",
  "Artificial General Intelligence",
  "Human Intelligence",
  "Vector",
  "Probability",
  "Baruch Spinoza",
]) {
  console.log(name, evaluateAutonomousLearningTarget({ name }));
}

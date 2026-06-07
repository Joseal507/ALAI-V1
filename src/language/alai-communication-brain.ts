import Database from "better-sqlite3";
import { learnLanguagePattern } from "./language-learning-engine";
import { improveLanguageFromFeedback } from "./language-self-improvement-engine";
import type { DetectedLanguage } from "./language-detector";

type CommunicationIssue = {
  instruction: string;
  reason: string;
};

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function hasForeignLanguageLeak(answer: string, outputLanguage: DetectedLanguage): boolean {
  if (outputLanguage !== "es") return false;

  const text = normalize(answer);

  const englishSignals = [
    " is ",
    " are ",
    " was ",
    " were ",
    " used ",
    " through ",
    " within ",
    " related to ",
    " type of ",
    " internal confidence",
    " reasoning from",
  ];

  return englishSignals.some((signal) => text.includes(signal));
}

function hasImplementationLeak(answer: string): boolean {
  const text = normalize(answer);

  const implementationSignals = [
    "graph",
    "trace",
    "answerplan",
    "internal_reasoning",
    "mode:",
  ];

  return implementationSignals.some((signal) => text.includes(signal));
}

function hasUnnaturalSelfReference(answer: string): boolean {
  const text = normalize(answer);

  return (
    text.includes("dentro de alai") ||
    text.includes("alai entiende esta comparación así") ||
    text.includes("alai entiende esta relación así")
  );
}

function detectCommunicationIssues(
  rawAnswer: string,
  outputLanguage: DetectedLanguage
): CommunicationIssue[] {
  const issues: CommunicationIssue[] = [];

  if (hasForeignLanguageLeak(rawAnswer, outputLanguage)) {
    issues.push({
      instruction:
        outputLanguage === "es"
          ? "Responde completamente en español natural cuando el usuario escribe en español."
          : "Keep the response in the user's language.",
      reason: "The answer mixed languages.",
    });
  }

  if (hasImplementationLeak(rawAnswer)) {
    issues.push({
      instruction:
        "No expongas detalles internos de implementación. Explica la idea de forma natural para el usuario.",
      reason: "The answer exposed internal implementation wording.",
    });
  }

  if (hasUnnaturalSelfReference(rawAnswer)) {
    issues.push({
      instruction:
        "Evita frases mecánicas sobre ALAI. Comunica la relación o explicación directamente.",
      reason: "The answer sounded mechanical or self-referential.",
    });
  }

  return issues;
}

export function learnCommunicationFromOwnAnswer(params: {
  db: Database.Database;
  userInput: string;
  rawAnswer: string;
  finalAnswer: string;
  outputLanguage: DetectedLanguage;
}): void {
  const issues = detectCommunicationIssues(params.rawAnswer, params.outputLanguage);

  for (const issue of issues) {
    learnLanguagePattern(params.db, {
      userInstruction: issue.instruction,
      previousResponse: params.rawAnswer,
      improvedResponse: params.finalAnswer,
    });

    improveLanguageFromFeedback(params.db, issue.instruction);
  }
}

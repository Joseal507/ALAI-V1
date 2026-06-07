import { verbalizeKnowledgeRelations } from "./alai-knowledge-verbalization-brain";
import { planAlaiResponse, type AlaiReasoningPlan } from "./alai-reasoning-planner-brain";

export type LanguageKnowledgeContext = {
  userMessage: string;
  conceptName: string;
  description?: string;
  masteryLevel?: string;
  confidence?: number;
  relations: {
    from: string;
    type: string;
    to: string;
    confidence?: number;
  }[];
  evidence: {
    sourceName: string;
    summary: string;
    reliability?: number;
  }[];
  examples: {
    text: string;
    confidence?: number;
  }[];
  compressedMemory?: {
    shortSummary?: string;
    technicalExplanation?: string;
    canonicalExample?: string;
    commonMisconceptions?: string;
    practicalUses?: string;
  };
};

function clean(value?: string): string {
  return (value || "")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function normalize(value?: string): string {
  return clean(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function sentence(value: string): string {
  const text = clean(value);
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function sentenceLower(value: string): string {
  const text = clean(value);
  if (!text) return "";
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function isWeakDescription(description?: string): boolean {
  const text = normalize(description);

  return (
    !text ||
    text.length < 20 ||
    text.includes("core concept for curriculum topic") ||
    text.includes("support concept for") ||
    text.includes("concept discovered during") ||
    text.includes("necesita una explicacion canonica")
  );
}

function baseDefinition(ctx: LanguageKnowledgeContext): string {
  const concept = clean(ctx.conceptName);
  const description = clean(ctx.description);
  const shortSummary = clean(ctx.compressedMemory?.shortSummary);
  const technical = clean(ctx.compressedMemory?.technicalExplanation);

  const chosen =
    !isWeakDescription(description) ? description :
    shortSummary || technical;

  if (!chosen) {
    return `${concept} es un concepto que ALAI reconoce, pero todavía necesita más evidencia para explicarlo con fuerza.`;
  }

  const normalizedChosen = normalize(chosen);
  const normalizedConcept = normalize(concept);

  if (
    normalizedConcept &&
    !normalizedChosen.startsWith(normalizedConcept) &&
    !normalizedChosen.startsWith(`un ${normalizedConcept}`) &&
    !normalizedChosen.startsWith(`una ${normalizedConcept}`) &&
    !normalizedChosen.startsWith(`el ${normalizedConcept}`) &&
    !normalizedChosen.startsWith(`la ${normalizedConcept}`)
  ) {
    return `Un ${concept.toLowerCase()} es ${sentenceLower(chosen)}`;
  }

  if (normalizedChosen.startsWith(normalizedConcept)) {
    return `Un ${concept.toLowerCase()} es ${sentenceLower(chosen.slice(concept.length).trim())}`;
  }

  return sentence(chosen);
}

function relationSentences(ctx: LanguageKnowledgeContext): string[] {
  return verbalizeKnowledgeRelations({
    conceptName: ctx.conceptName,
    relations: ctx.relations,
  });
}

function bestExample(ctx: LanguageKnowledgeContext): string {
  return (
    clean(ctx.examples[0]?.text) ||
    clean(ctx.compressedMemory?.canonicalExample)
  );
}

function evidencePoints(ctx: LanguageKnowledgeContext): string[] {
  return ctx.evidence
    .map((item) => clean(item.summary))
    .filter((summary) => summary.length >= 30)
    .slice(0, 3);
}

function confidenceLabel(ctx: LanguageKnowledgeContext): string {
  const confidence = ctx.confidence ?? 0;
  const mastery = normalize(ctx.masteryLevel);

  if (mastery === "mastered" || confidence >= 0.82) return "alta";
  if (mastery === "strong" || confidence >= 0.65) return "media-alta";
  if (confidence >= 0.45) return "media";
  return "baja";
}

function practicalUses(ctx: LanguageKnowledgeContext): string {
  const compressed = clean(ctx.compressedMemory?.practicalUses);
  if (compressed) return sentence(compressed);

  const relations = ctx.relations.filter((r) =>
    ["USES", "USED_FOR", "EXPLAINS", "DEPENDS_ON"].includes(r.type.toUpperCase())
  );

  if (relations.length > 0) {
    const rendered = relationSentences({ ...ctx, relations }).slice(0, 2);
    if (rendered.length > 0) return rendered.join(" ");
  }

  return `Todavía no tengo suficientes usos verificados de ${ctx.conceptName}. Necesito más evidencia o relaciones antes de darte aplicaciones fuertes.`;
}

function misconceptions(ctx: LanguageKnowledgeContext): string {
  const compressed = clean(ctx.compressedMemory?.commonMisconceptions);
  if (compressed) return sentence(compressed);

  return `Un error común es repetir la definición de ${ctx.conceptName} sin conectarla con ejemplos, relaciones o evidencia. Para dominarlo, hay que poder explicarlo, aplicarlo y compararlo.`;
}

function technicalCore(ctx: LanguageKnowledgeContext): string {
  const technical = clean(ctx.compressedMemory?.technicalExplanation);

  if (technical) {
    const concept = clean(ctx.conceptName);
    const normalizedTechnical = normalize(technical);
    const normalizedConcept = normalize(concept);

    if (normalizedTechnical.startsWith(normalizedConcept)) {
      const remainder = sentenceLower(technical.slice(concept.length).trim());
      const article =
        /^(objeto|concepto|elemento|proceso|sistema|metodo|método|valor|numero|número)\b/i.test(remainder)
          ? "un "
          : "";
      return `Un ${concept.toLowerCase()} es ${article}${remainder}`;
    }

    if (
      !normalizedTechnical.startsWith(`un ${normalizedConcept}`) &&
      !normalizedTechnical.startsWith(`una ${normalizedConcept}`) &&
      !normalizedTechnical.startsWith(`el ${normalizedConcept}`) &&
      !normalizedTechnical.startsWith(`la ${normalizedConcept}`)
    ) {
      return `Un ${concept.toLowerCase()} es ${sentenceLower(technical)}`;
    }

    return sentence(technical);
  }

  return `Técnicamente, ${sentenceLower(baseDefinition(ctx))}`;
}

function analogy(ctx: LanguageKnowledgeContext): string {
  const concept = normalize(ctx.conceptName);

  if (concept === "vector") {
    return "Una analogía útil: imagina que le das instrucciones a alguien para caminar. No basta decir cuánto debe caminar; también tienes que decir hacia dónde. Un vector funciona parecido: guarda cantidad y dirección.";
  }

  const example = bestExample(ctx);
  if (example) {
    return `Una analogía útil puede construirse desde este ejemplo: ${example}`;
  }

  return `Una analogía útil para ${ctx.conceptName} depende de su definición y de sus relaciones principales.`;
}

function comparison(ctx: LanguageKnowledgeContext): string {
  const relations = relationSentences(ctx);

  if (relations.length > 0) {
    return [
      `${ctx.conceptName} se puede comparar usando sus relaciones principales.`,
      ...relations.slice(0, 2),
    ].join(" ");
  }

  return `Para comparar bien ${ctx.conceptName}, ALAI necesita tener identificado el segundo concepto y relaciones verificadas entre ambos.`;
}

function buildEvidenceSection(ctx: LanguageKnowledgeContext): string | null {
  const points = evidencePoints(ctx);
  if (points.length === 0) return null;

  return [
    "Según la evidencia guardada:",
    ...points.map((point) => `- ${point}`),
  ].join("\n");
}

function buildReasonedExplanation(ctx: LanguageKnowledgeContext, plan: AlaiReasoningPlan): string {
  const parts: string[] = [];
  const base = plan.depth === "technical" || plan.needs.includes("technical_depth")
    ? technicalCore(ctx)
    : baseDefinition(ctx);

  parts.push(base);

  const relations = relationSentences(ctx);
  if (relations.length > 0 && (plan.needs.includes("relations") || plan.depth !== "simple")) {
    parts.push(`Conexión interna: ${relations.slice(0, plan.depth === "technical" ? 3 : 2).join(" ")}`);
  }

  const example = bestExample(ctx);
  if (example && (plan.needs.includes("example") || plan.depth === "simple")) {
    parts.push(`Ejemplo: ${example}`);
  }

  if (plan.needs.includes("uses")) {
    parts.push(`Uso: ${practicalUses(ctx)}`);
  }

  if (plan.needs.includes("misconceptions")) {
    parts.push(`Cuidado: ${misconceptions(ctx)}`);
  }

  const evidence = buildEvidenceSection(ctx);
  if (evidence && plan.depth === "technical") {
    parts.push(evidence);
  }

  if (plan.needs.includes("exam_focus")) {
    parts.push(`Para examen: aprende la definición, un ejemplo, una relación importante y una confusión común.`);
  }

  parts.push(`Nivel de confianza interna: ${confidenceLabel(ctx)}.`);

  return parts.join("\n\n").trim();
}

function composeFromPlan(
  ctx: LanguageKnowledgeContext,
  plan: AlaiReasoningPlan
): string {
  if (plan.needs.includes("summary") && plan.goal === "summarize") {
    return `En resumen, ${sentenceLower(baseDefinition(ctx))}`;
  }

  if (plan.needs.includes("example") && plan.goal === "give_example") {
    const example = bestExample(ctx);
    return example
      ? `Ejemplo: ${example}`
      : `Todavía no tengo un ejemplo fuerte para ${ctx.conceptName}.`;
  }

  if (plan.needs.includes("uses") && plan.goal === "show_uses") {
    return practicalUses(ctx);
  }

  if (plan.needs.includes("misconceptions") && plan.goal === "warn_misconceptions") {
    return misconceptions(ctx);
  }

  if (plan.needs.includes("analogy") && plan.goal === "analogize") {
    return analogy(ctx);
  }

  if (plan.needs.includes("comparison") && plan.goal === "compare") {
    return comparison(ctx);
  }

  const answer = buildReasonedExplanation(ctx, plan);

  if (plan.shouldBeConcise) {
    return answer.split("\n\n").slice(0, 1).join("\n\n").trim();
  }

  return answer;
}

export function runAlaiLanguageReasoningBrain(
  ctx: LanguageKnowledgeContext
): string {
  const plan = planAlaiResponse(ctx.userMessage);
  return composeFromPlan(ctx, plan);
}

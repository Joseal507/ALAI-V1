export type AlaiResponseNeed =
  | "definition"
  | "technical_depth"
  | "example"
  | "summary"
  | "uses"
  | "misconceptions"
  | "relations"
  | "exam_focus"
  | "analogy"
  | "comparison"
  | "simple_language";

export type AlaiReasoningPlan = {
  goal:
    | "explain"
    | "teach"
    | "summarize"
    | "give_example"
    | "show_uses"
    | "warn_misconceptions"
    | "compare"
    | "analogize";
  depth: "simple" | "normal" | "technical";
  needs: AlaiResponseNeed[];
  shouldBeConcise: boolean;
};

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export function planAlaiResponse(message: string): AlaiReasoningPlan {
  const text = normalize(message);

  const needs: AlaiResponseNeed[] = [];
  let goal: AlaiReasoningPlan["goal"] = "explain";
  let depth: AlaiReasoningPlan["depth"] = "normal";
  let shouldBeConcise = false;

  if (
    text.includes("simple") ||
    text.includes("facil") ||
    text.includes("facilito") ||
    text.includes("como niño") ||
    text.includes("para un niño")
  ) {
    depth = "simple";
    needs.push("simple_language");
  }

  if (
    text.includes("tecnico") ||
    text.includes("tecnica") ||
    text.includes("formal") ||
    text.includes("profundo") ||
    text.includes("universitario")
  ) {
    depth = "technical";
    needs.push("technical_depth");
  }

  if (
    text.includes("examen") ||
    text.includes("prueba") ||
    text.includes("quiz") ||
    text.includes("estudiar")
  ) {
    goal = "teach";
    depth = depth === "simple" ? "simple" : "technical";
    needs.push("definition", "technical_depth", "example", "misconceptions", "summary", "exam_focus");
  }

  if (
    text.includes("ejemplo") ||
    text.includes("caso")
  ) {
    goal = "give_example";
    needs.push("example");
  }

  if (
    text.includes("resume") ||
    text.includes("resumen") ||
    text.includes("resumelo") ||
    text.includes("en corto")
  ) {
    goal = "summarize";
    shouldBeConcise = true;
    needs.push("summary");
  }

  if (
    text.includes("explicamelo para un examen") ||
    text.includes("explicame para un examen") ||
    text.includes("para un examen") ||
    text.includes("examen")
  ) {
    goal = "teach";
    depth = "technical";
    shouldBeConcise = false;
    needs.push("definition", "technical_depth", "example", "misconceptions", "summary", "exam_focus");
  }

  if (
    text.includes("para que sirve") ||
    text.includes("uso") ||
    text.includes("usos") ||
    text.includes("aplicacion") ||
    text.includes("aplicaciones") ||
    text.includes("donde se usa")
  ) {
    goal = "show_uses";
    needs.push("uses");
  }

  if (
    text.includes("error comun") ||
    text.includes("errores comunes") ||
    text.includes("confusion") ||
    text.includes("malentendido") ||
    text.includes("equivocacion")
  ) {
    goal = "warn_misconceptions";
    needs.push("misconceptions");
  }

  if (
    text.includes("analogia") ||
    text.includes("analogía") ||
    text.includes("comparalo con algo simple") ||
    text.includes("como si fuera")
  ) {
    goal = "analogize";
    depth = depth === "technical" ? "technical" : "simple";
    needs.push("analogy", "simple_language");
  }

  if (
    text.includes("compara") ||
    text.includes("comparar") ||
    text.includes("diferencia") ||
    text.includes("diferencias") ||
    text.includes("versus") ||
    text.includes(" vs ")
  ) {
    goal = "compare";
    needs.push("comparison", "definition");
  }

  if (needs.length === 0) {
    needs.push("definition", "relations");
  }

  return {
    goal,
    depth,
    needs: unique(needs),
    shouldBeConcise,
  };
}

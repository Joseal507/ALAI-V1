export type NaturalRelation = {
  from: string;
  type: string;
  to: string;
};

function naturalName(name: string): string {
  const normalized = name.trim().toLowerCase();

  const map: Record<string, string> = {
    "scalar multiplication": "la multiplicación por escalar",
    "euclidean vector": "un vector euclidiano",
    "vector": "vector",
    "vector space": "un espacio vectorial",
  };

  return map[normalized] || name;
}

export function naturalizeRelation(
  relation: NaturalRelation
): string {
  const type = relation.type.toUpperCase();
  const from = naturalName(relation.from);
  const to = naturalName(relation.to);

  function capitalize(sentence: string): string {
    return sentence.charAt(0).toUpperCase() + sentence.slice(1);
  }

  switch (type) {
    case "IS_A":
      return capitalize(`${from} es un tipo de ${to}.`);

    case "PART_OF":
      return capitalize(`${from} forma parte de ${to}.`);

    case "DEPENDS_ON":
      return capitalize(`${from} depende de ${to}.`);

    case "USES":
      return capitalize(`${from} utiliza ${to}.`);

    case "USED_FOR":
      return capitalize(`${from} se utiliza para ${to}.`);

    case "PRODUCES":
      return capitalize(`${from} puede producir un ${to}.`);

    case "RELATED_TO":
      return capitalize(`${from} está relacionado con ${to}.`);

    case "CHANGES":
      return capitalize(`${from} modifica ${to}.`);

    case "EXPLAINS":
      return capitalize(`${from} explica ${to}.`);

    default:
      return capitalize(`${from} ${relation.type} ${to}.`);
  }
}

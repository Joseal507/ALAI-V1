import { renderAlaiLanguageOutput } from "../src/alai/alai-language-output-engine";

const samples = [
  `ALAI encontró el concepto "Vector".
Definición interna: A vector has magnitude and direction.
Estado: PENDING. Dominio: WEAK (0.2).
Puntos clave:
- Vectors can be added.
En mi memoria interna esto está conectado con: Vector (PENDING · WEAK)
Fuentes usadas: Vector space`,

  `ALAI encontró información parcial y creó una síntesis provisional mientras sigue acumulando evidencia.

Puntos clave:
- example &quot;text&quot; with &#039;quotes&#039;`,
];

for (const rawAnswer of samples) {
  console.log("--- RAW ---");
  console.log(rawAnswer);
  console.log("--- FINAL ---");
  console.log(renderAlaiLanguageOutput({ rawAnswer, confidence: 0.45 }));
}

import { detectAlaiIntent } from "../src/alai/alai-intent-engine";

const cases = [
  "cuanto es 218 - 33",
  "hola",
  "quien eres",
  "que es la suma?",
  "dime la suma de una manera mas tecnica",
  "que es fotosintesis",
  "dime eso de una manera mas tecnica sobre fotosintesis",
  "dame otro ejemplo",
  "resume eso",
  "compara suma y resta",
  "háblame de vectores",
];

for (const item of cases) {
  console.log(JSON.stringify({ input: item, result: detectAlaiIntent(item) }, null, 2));
}

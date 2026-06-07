import { evaluateKnowledgeSafety } from "../src/alai/alai-knowledge-safety-gate";

const cases = [
  {
    topic: "Vector",
    sources: [
      {
        title: "Vector space",
        url: "https://example.com/vector-space",
        snippet: "A vector space is a mathematical structure in linear algebra.",
        score: 100,
      },
      {
        title: "Euclidean vector",
        url: "https://example.com/euclidean-vector",
        snippet: "In mathematics, vectors have magnitude and direction.",
        score: 100,
      },
    ],
  },
  {
    topic: "Photosynthesis",
    sources: [
      {
        title: "Affordable Care Act",
        url: "https://example.com/aca",
        snippet: "Health policy and insurance coverage.",
        score: 10,
      },
    ],
  },
  {
    topic: "Suma",
    sources: [],
  },
];

for (const item of cases) {
  console.log(JSON.stringify({
    topic: item.topic,
    decision: evaluateKnowledgeSafety(item),
  }, null, 2));
}

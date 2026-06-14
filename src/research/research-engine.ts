export interface ResearchSource {
  title: string;
  url: string;
  snippet: string;
  score?: number;
}

export interface ResearchResult {
  query: string;
  sources: ResearchSource[];
}

interface WikipediaSearchItem {
  title: string;
  pageid: number;
  snippet: string;
}

interface WikipediaPageItem {
  pageid: number;
  title: string;
  extract?: string;
}

function stripHtml(value: string): string {
  return String(value || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function normalize(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function cleanQuery(query: string): string {
  let q = String(query || "");

  q = q.replace(/^Research required before answering\.\s*/i, "");
  q = q.replace(/^Priority user-demand learning\.\s*/i, "");
  q = q.replace(/Reason:.*$/i, "");
  q = q.replace(/User question:/i, "");
  q = q.replace(/Question:/i, "");
  q = q.replace(/Target:/i, "");
  q = q.replace(/\beducational basics\b/gi, "");
  q = q.replace(/\breliable educational explanation basics\b/gi, "");
  q = q.replace(/\s+/g, " ").trim();

  return q || query;
}

function extractUsefulTarget(query: string): string {
  const raw = cleanQuery(query);
  const lower = normalize(raw);

  const targetMatch = raw.match(/Target:\s*([^\.]+)(?:\.|$)/i);
  if (targetMatch?.[1]) return targetMatch[1].trim();

  if (lower.includes("celula madre pluripotente") || lower.includes("célula madre pluripotente")) {
    return "pluripotent stem cell";
  }

  if ((lower.includes("adn") && lower.includes("arn")) || lower.includes("dna") && lower.includes("rna")) {
    return "DNA RNA comparison";
  }

  if (lower.includes("messi")) return "Lionel Messi";
  if (lower.includes("cristiano ronaldo")) return "Cristiano Ronaldo";
  if (lower.includes("algebra lineal") || lower.includes("álgebra lineal")) return "linear algebra";
  if (lower.includes("vector")) return "Euclidean vector vector space linear algebra";
  if (lower.includes("fotosintesis") || lower.includes("fotosíntesis")) return "photosynthesis";
  if (lower.includes("mutacion") || lower.includes("mutación")) return "mutation genetics";
  if (lower.includes("proteina") || lower.includes("proteína")) return "protein biology";
  if (lower.includes("celula") || lower.includes("célula")) return "cell biology";

  return raw;
}

function exactTitlesForQuery(query: string): string[] {
  const lower = normalize(query);

  const titles: string[] = [];

  if (lower.includes("pluripotent stem cell") || lower.includes("celula madre pluripotente")) {
    titles.push("Pluripotency", "Stem cell", "Induced pluripotent stem cell");
  }

  if (lower.includes("dna rna") || (lower.includes("adn") && lower.includes("arn"))) {
    titles.push("DNA", "RNA", "Central dogma of molecular biology");
  }

  if (lower.includes("lionel messi") || lower.includes("messi")) {
    titles.push("Lionel Messi");
  }

  if (lower.includes("cristiano ronaldo")) {
    titles.push("Cristiano Ronaldo");
  }

  if (lower.includes("linear algebra") || lower.includes("algebra lineal")) {
    titles.push("Linear algebra", "Vector space", "Euclidean vector");
  }

  if (lower.includes("vector")) {
    titles.push("Euclidean vector", "Vector space");
  }

  if (lower.includes("photosynthesis") || lower.includes("fotosintesis")) {
    titles.push("Photosynthesis");
  }

  if (lower.includes("mutation")) {
    titles.push("Mutation");
  }

  if (lower.includes("protein")) {
    titles.push("Protein");
  }

  if (lower.includes("cell biology") || lower === "cell") {
    titles.push("Cell (biology)");
  }

  return [...new Set(titles)];
}

async function fetchExactWikipediaPages(titles: string[]): Promise<ResearchSource[]> {
  if (titles.length === 0) return [];

  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("prop", "extracts");
  url.searchParams.set("exintro", "true");
  url.searchParams.set("explaintext", "true");
  url.searchParams.set("redirects", "true");
  url.searchParams.set("titles", titles.join("|"));
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");

  try {
    const response = await fetch(url);
    if (!response.ok) return [];

    const data = await response.json() as {
      query?: { pages?: Record<string, WikipediaPageItem> };
    };

    return Object.values(data.query?.pages || {})
      .filter((page) => page.pageid && page.extract)
      .map((page) => ({
        title: page.title,
        url: `https://en.wikipedia.org/?curid=${page.pageid}`,
        snippet: stripHtml((page.extract || "").slice(0, 900)),
        score: 100,
      }));
  } catch {
    return [];
  }
}

function getQueryTerms(query: string): string[] {
  return normalize(query)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((term) => term.length >= 3)
    .filter((term) => ![
      "the","and","for","with","basics","educational","examples","definition",
      "required","before","answering","question","reason","target","priority",
      "user","demand","learning","answered","immediately","brain","grounded",
      "permanent","graph"
    ].includes(term));
}

function scoreSource(query: string, source: ResearchSource): number {
  const title = normalize(source.title);
  const snippet = normalize(source.snippet);
  const text = `${title} ${snippet}`;
  const terms = getQueryTerms(query);

  let score = 0;

  for (const term of terms) {
    if (title.includes(term)) score += 8;
    if (snippet.includes(term)) score += 3;
  }

  if (text.includes("definition")) score += 4;
  if (text.includes("biology")) score += 4;
  if (text.includes("genetic")) score += 4;
  if (text.includes("mathematics")) score += 3;
  if (text.includes("football")) score += 3;
  if (text.includes("linear algebra")) score += 8;
  if (text.includes("stem cell")) score += 8;
  if (text.includes("pluripotent")) score += 10;
  if (text.includes("dna")) score += 6;
  if (text.includes("rna")) score += 6;

  if (text.includes("race and intelligence")) score -= 20;
  if (text.includes("gini coefficient")) score -= 10;
  if (text.includes("political")) score -= 4;

  return score;
}

function buildWikipediaSearchQuery(query: string): string {
  return extractUsefulTarget(query);
}

async function searchWikipedia(query: string): Promise<ResearchSource[]> {
  const searchQuery = buildWikipediaSearchQuery(query);
  const url = new URL("https://en.wikipedia.org/w/api.php");

  url.searchParams.set("action", "query");
  url.searchParams.set("list", "search");
  url.searchParams.set("srsearch", searchQuery);
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");

  try {
    const response = await fetch(url);
    if (!response.ok) return [];

    const data = await response.json() as {
      query?: { search?: WikipediaSearchItem[] };
    };

    const mapped = (data.query?.search || [])
      .map((item) => {
        const source = {
          title: item.title,
          url: `https://en.wikipedia.org/?curid=${item.pageid}`,
          snippet: stripHtml(item.snippet),
        };

        return {
          ...source,
          score: scoreSource(searchQuery, source),
        };
      })
      .sort((a, b) => (b.score || 0) - (a.score || 0));

    const strong = mapped.filter((source) => (source.score || 0) >= 2).slice(0, 5);
    return strong.length > 0 ? strong : mapped.slice(0, 3);
  } catch {
    return [];
  }
}

export async function researchWeb(query: string): Promise<ResearchResult> {
  const searchQuery = buildWikipediaSearchQuery(query);
  const exactSources = await fetchExactWikipediaPages(exactTitlesForQuery(searchQuery));
  const searchSources = await searchWikipedia(searchQuery);

  const seen = new Set<string>();
  const sources = [...exactSources, ...searchSources].filter((source) => {
    if (seen.has(source.url)) return false;
    seen.add(source.url);
    return true;
  }).slice(0, 5);

  return {
    query: searchQuery,
    sources,
  };
}

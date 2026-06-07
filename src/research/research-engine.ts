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
  return value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function exactTitlesForQuery(query: string): string[] {
  const lower = normalize(query);

  if (lower.includes("vector")) {
    return ["Euclidean vector", "Vector space"];
  }

  if (lower.includes("scalar")) {
    return ["Scalar (mathematics)", "Scalar multiplication"];
  }

  if (lower.includes("basis")) {
    return ["Basis (linear algebra)"];
  }

  if (lower.includes("span")) {
    return ["Linear span"];
  }

  if (lower.includes("linear combination")) {
    return ["Linear combination"];
  }

  if (lower.includes("inverse element")) {
    return ["Inverse element"];
  }

  if (lower.includes("primary education")) {
    return ["Primary education"];
  }

  if (lower.includes("counting")) {
    return ["Counting"];
  }

  return [];
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

  const response = await fetch(url);

  if (!response.ok) return [];

  const data = await response.json() as {
    query?: {
      pages?: Record<string, WikipediaPageItem>;
    };
  };

  return Object.values(data.query?.pages || {})
    .filter((page) => page.pageid && page.extract)
    .map((page) => ({
      title: page.title,
      url: `https://en.wikipedia.org/?curid=${page.pageid}`,
      snippet: stripHtml((page.extract || "").slice(0, 500)),
      score: 100,
    }));
}

function getQueryTerms(query: string): string[] {
  return normalize(query)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((term) => term.length >= 3)
    .filter((term) => !["the", "and", "for", "with", "basics", "educational", "examples", "definition"].includes(term));
}

function scoreSource(query: string, source: ResearchSource): number {
  const title = normalize(source.title);
  const snippet = normalize(source.snippet);
  const text = `${title} ${snippet}`;
  const terms = getQueryTerms(query);

  let score = 0;

  for (const term of terms) {
    if (title.includes(term)) score += 5;
    if (snippet.includes(term)) score += 2;
  }

  if (text.includes("definition")) score += 4;
  if (text.includes("example")) score += 3;
  if (text.includes("linear algebra")) score += 5;
  if (text.includes("vector space")) score += 4;
  if (text.includes("mathematics")) score += 3;
  if (text.includes("education")) score += 2;

  if (text.includes("race and intelligence")) score -= 10;
  if (text.includes("gini coefficient")) score -= 10;
  if (text.includes("lift (force)")) score -= 8;
  if (text.includes("adjoint representation")) score -= 6;
  if (text.includes("political")) score -= 4;

  return score;
}

function buildWikipediaSearchQuery(query: string): string {
  const lower = normalize(query);

  if (lower.includes("vector")) return "Euclidean vector vector space linear algebra";
  if (lower.includes("scalar")) return "Scalar mathematics scalar multiplication";
  if (lower.includes("basis")) return "Basis linear algebra";
  if (lower.includes("span")) return "Linear span";
  if (lower.includes("linear combination")) return "Linear combination";
  if (lower.includes("inverse element")) return "Inverse element abstract algebra";
  if (lower.includes("primary education")) return "Primary education";
  if (lower.includes("counting")) return "Counting mathematics";

  return query;
}

async function searchWikipedia(query: string): Promise<ResearchSource[]> {
  const searchQuery = buildWikipediaSearchQuery(query);
  const url = new URL("https://en.wikipedia.org/w/api.php");

  url.searchParams.set("action", "query");
  url.searchParams.set("list", "search");
  url.searchParams.set("srsearch", searchQuery);
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");

  const response = await fetch(url);

  if (!response.ok) return [];

  const data = await response.json() as {
    query?: {
      search?: WikipediaSearchItem[];
    };
  };

  return (data.query?.search || [])
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
    .filter((source) => (source.score || 0) >= 3)
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 5);
}

export async function researchWeb(query: string): Promise<ResearchResult> {
  const exactSources = await fetchExactWikipediaPages(exactTitlesForQuery(query));
  const searchSources = await searchWikipedia(query);

  const seen = new Set<string>();
  const sources = [...exactSources, ...searchSources].filter((source) => {
    if (seen.has(source.url)) return false;
    seen.add(source.url);
    return true;
  }).slice(0, 5);

  return {
    query: buildWikipediaSearchQuery(query),
    sources,
  };
}

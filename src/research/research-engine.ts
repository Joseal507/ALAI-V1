export interface ResearchSource {
  title: string;
  url: string;
  snippet: string;
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

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

export async function researchWeb(query: string): Promise<ResearchResult> {
  const url = new URL("https://en.wikipedia.org/w/api.php");

  url.searchParams.set("action", "query");
  url.searchParams.set("list", "search");
  url.searchParams.set("srsearch", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Research failed: ${response.status}`);
  }

  const data = await response.json() as {
    query?: {
      search?: WikipediaSearchItem[];
    };
  };

  const sources = (data.query?.search || []).slice(0, 5).map((item) => ({
    title: item.title,
    url: `https://en.wikipedia.org/?curid=${item.pageid}`,
    snippet: stripHtml(item.snippet),
  }));

  return {
    query,
    sources,
  };
}

export interface SearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
  publishedDate?: string;
}

export interface SearchResponse {
  results: SearchResult[];
  query: string;
}

export async function searchWeb(
  query: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<SearchResponse> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "advanced",
      include_answer: false,
      include_raw_content: false,
      max_results: 5,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Search failed: HTTP ${res.status}${text ? ` - ${text}` : ""}`);
  }

  const data = await res.json();
  return { results: data.results || [], query };
}

export function formatSearchResultsForLLM(response: SearchResponse): string {
  if (response.results.length === 0) {
    return "No relevant search results found for this query.";
  }

  let formatted = `Web search results for "${response.query}":\n\n`;
  response.results.forEach((r, i) => {
    formatted += `[${i + 1}] ${r.title}\n`;
    formatted += `URL: ${r.url}\n`;
    if (r.publishedDate) formatted += `Published: ${r.publishedDate}\n`;
    formatted += `${r.content}\n\n`;
  });
  formatted +=
    "Use these sources to answer the user's question. Cite sources inline using [1], [2], etc. when referencing specific information.";
  return formatted;
}

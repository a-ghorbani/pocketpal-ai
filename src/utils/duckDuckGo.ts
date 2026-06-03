import axios from 'axios';

export type DuckDuckGoSearchResult = {
  title: string;
  snippet: string;
  url: string;
};

const DUCKDUCKGO_URL = 'https://api.duckduckgo.com/';

function normalizeDuckDuckGoResult(result: any): DuckDuckGoSearchResult | null {
  const title = result.Text || result.Heading || result.Name || '';
  const url = result.FirstURL || result.FirstURL?.toString() || '';
  const snippet = result.Text || result.Result || result.Description || '';
  if (!title || !url) {
    return null;
  }
  return {
    title: title.trim(),
    snippet: snippet.trim(),
    url: url.toString().trim(),
  };
}

function flattenRelatedTopics(relatedTopics: any[]): any[] {
  return relatedTopics.flatMap(topic => {
    if (topic.Topics && Array.isArray(topic.Topics)) {
      return topic.Topics;
    }
    return topic;
  });
}

export async function fetchDuckDuckGoSearchResults(
  query: string,
  limit = 3,
): Promise<DuckDuckGoSearchResult[]> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return [];
  }

  try {
    const response = await axios.get(DUCKDUCKGO_URL, {
      params: {
        q: trimmedQuery,
        format: 'json',
        no_html: 1,
        skip_disambig: 1,
      },
      timeout: 5000,
    });

    const data = response.data || {};
    const results: DuckDuckGoSearchResult[] = [];

    if (Array.isArray(data.Results)) {
      for (const item of data.Results) {
        const normalized = normalizeDuckDuckGoResult(item);
        if (normalized) {
          results.push(normalized);
        }
        if (results.length >= limit) {
          return results.slice(0, limit);
        }
      }
    }

    if (Array.isArray(data.RelatedTopics)) {
      for (const item of flattenRelatedTopics(data.RelatedTopics)) {
        const normalized = normalizeDuckDuckGoResult(item);
        if (normalized) {
          results.push(normalized);
        }
        if (results.length >= limit) {
          return results.slice(0, limit);
        }
      }
    }

    if (results.length === 0 && data.AbstractURL && data.AbstractText) {
      results.push({
        title: data.Heading || trimmedQuery,
        snippet: data.AbstractText,
        url: data.AbstractURL,
      });
    }

    return results.slice(0, limit);
  } catch (error) {
    console.error('DuckDuckGo search failed:', error);
    return [];
  }
}

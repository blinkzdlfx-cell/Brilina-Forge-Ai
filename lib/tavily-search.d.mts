export interface TavilySearchResult {
  title: string
  url: string
  content: string
  publishedDate?: string
}

export interface TavilySearchResponse {
  query: string
  results: TavilySearchResult[]
  error?: string
}

export function searchTavily(
  query: string,
  options?: {
    apiKey?: string
    fetchImpl?: typeof fetch
    signal?: AbortSignal
    timeoutMs?: number
  },
): Promise<TavilySearchResponse>

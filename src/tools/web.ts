/**
 * Web fetch tool - allows Monkey to access the internet.
 */

export const webFetchDef = {
  name: 'web_fetch',
  description: 'Fetch a URL and return its content. Supports web pages (returns text content), APIs (returns JSON), etc. Use this to look up information, read documentation, check APIs.',
  input_schema: {
    type: 'object' as const,
    properties: {
      url: { type: 'string', description: 'The URL to fetch' },
      method: { type: 'string', description: 'HTTP method (default: GET)', enum: ['GET', 'POST', 'PUT', 'DELETE'] },
      headers: { type: 'object', description: 'Optional HTTP headers as key-value pairs' },
      body: { type: 'string', description: 'Request body for POST/PUT' },
      max_length: { type: 'number', description: 'Max response length in chars (default: 20000)' },
    },
    required: ['url'],
  },
}

export const webSearchDef = {
  name: 'web_search',
  description: 'Search the web using DuckDuckGo. Returns search results with titles, URLs and snippets.',
  input_schema: {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: 'Search query' },
      max_results: { type: 'number', description: 'Max number of results (default: 5)' },
    },
    required: ['query'],
  },
}

export async function executeWebFetch(input: Record<string, unknown>): Promise<string> {
  const url = input.url as string
  const method = (input.method as string) || 'GET'
  const headers = (input.headers as Record<string, string>) || {}
  const body = input.body as string | undefined
  const maxLength = (input.max_length as number) || 20000

  if (!url) return 'Error: url is required'

  try {
    const resp = await fetch(url, {
      method,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ...headers,
      },
      body: body || undefined,
      signal: AbortSignal.timeout(15000),
    })

    const contentType = resp.headers.get('content-type') || ''

    if (!resp.ok) {
      return `Error: HTTP ${resp.status} ${resp.statusText}`
    }

    let text = await resp.text()

    // If HTML, do basic extraction
    if (contentType.includes('text/html')) {
      text = extractTextFromHtml(text)
    }

    if (text.length > maxLength) {
      text = text.slice(0, maxLength) + `\n\n[Truncated at ${maxLength} chars]`
    }

    return text
  } catch (err: unknown) {
    return `Error: ${(err as Error).message}`
  }
}

export async function executeWebSearch(input: Record<string, unknown>): Promise<string> {
  const query = input.query as string
  const maxResults = (input.max_results as number) || 5

  if (!query) return 'Error: query is required'

  try {
    // Use DuckDuckGo HTML search
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(10000),
    })

    if (!resp.ok) return `Error: search failed (HTTP ${resp.status})`

    const html = await resp.text()
    const results = parseDuckDuckGoResults(html, maxResults)

    if (results.length === 0) return 'No results found.'

    return results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`).join('\n\n')
  } catch (err: unknown) {
    return `Error: ${(err as Error).message}`
  }
}

function extractTextFromHtml(html: string): string {
  // Remove script, style, nav, header, footer
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    // Convert common block elements to newlines
    .replace(/<\/(p|div|h[1-6]|li|tr|br\s*\/?)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    // Strip remaining tags
    .replace(/<[^>]+>/g, '')
    // Decode entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // Clean up whitespace
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n/g, '\n\n')
    .trim()

  return text
}

interface SearchResult {
  title: string
  url: string
  snippet: string
}

function parseDuckDuckGoResults(html: string, max: number): SearchResult[] {
  const results: SearchResult[] = []
  // DuckDuckGo HTML results are in <a class="result__a"> with <a class="result__snippet">
  const resultBlocks = html.split(/class="result__body"/).slice(1)

  for (const block of resultBlocks) {
    if (results.length >= max) break

    const titleMatch = block.match(/class="result__a"[^>]*>([^<]+)</)
    const urlMatch = block.match(/class="result__url"[^>]*href="([^"]*)"/) ||
                     block.match(/class="result__a"[^>]*href="([^"]*)"/)
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\//)

    if (titleMatch) {
      let url = urlMatch?.[1] || ''
      // DuckDuckGo wraps URLs in redirect
      const uddgMatch = url.match(/uddg=([^&]+)/)
      if (uddgMatch) url = decodeURIComponent(uddgMatch[1])

      results.push({
        title: titleMatch[1].trim(),
        url: url,
        snippet: (snippetMatch?.[1] || '').replace(/<[^>]+>/g, '').trim(),
      })
    }
  }

  return results
}

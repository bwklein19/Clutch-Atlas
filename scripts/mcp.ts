export interface McpProvider {
  id: number;
  title: string;
  url: string;
  logo?: string | null;
  min_project_size?: number | null;
  rating?: number | null;
  reviews_number?: number | null;
  location?: string | null;
  office_locations?: string[] | null;
  generated_summary?: string | null;
  hourly_rate?: string | null;
  cost_average_score?: number | null;
  verification_level?: string | null;
  verification_status?: string | null;
  clutch_guarantee?: boolean | null;
  certifications?: { name: string; type: string }[] | null;
  pricing_summary?: string | null;
  aggregated_review_metrics?: {
    count?: number | null;
    count_verified?: number | null;
    recent_reviews?: number | null;
    recent_verified_count?: number | null;
    count_for_service?: number | null;
    most_common_project_size?: string | null;
  } | null;
}

export interface ProviderPayload {
  providers?: McpProvider[];
  service?: string;
  page_url?: string;
}

export async function fetchProviders(endpoint: string, input: { service: string; offset: number; limit: number }): Promise<ProviderPayload> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: input.offset + 1, method: 'tools/call',
      params: { name: 'recommend_service_providers', arguments: input }
    }),
    signal: AbortSignal.timeout(60_000)
  });
  if (!response.ok) throw new Error(`Clutch MCP returned HTTP ${response.status}`);
  const envelope = parseMcpEventStream(await response.text());
  if (envelope.error) throw new Error(`Clutch MCP error: ${envelope.error.message || JSON.stringify(envelope.error)}`);
  const result = envelope.result as { isError?: boolean; content?: { type: string; text?: string }[] } | undefined;
  const text = result?.content?.find((item) => item.type === 'text')?.text;
  if (!text) throw new Error('Clutch MCP returned no provider payload');
  if (result?.isError) throw new Error(`Clutch MCP tool error: ${text}`);
  const payload = JSON.parse(text) as ProviderPayload;
  if (payload.providers && !Array.isArray(payload.providers)) throw new Error('Clutch MCP provider payload is invalid');
  return payload;
}

export function parseMcpEventStream(raw: string): { result?: unknown; error?: { message?: string } } {
  const data = raw.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('');
  if (!data) throw new Error('Clutch MCP returned an empty event stream');
  return JSON.parse(data);
}

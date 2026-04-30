const BASE = 'https://amcgahmo7i.execute-api.us-east-1.amazonaws.com/dev';

export interface BackendCompetitor {
  name: string;
  url: string;
  one_line_description: string;
  target_segment: 'enterprise' | 'mid_market' | 'smb' | 'prosumer' | 'consumer' | 'unknown';
  pricing_tier: 'free' | 'low' | 'mid' | 'high' | 'enterprise' | 'unknown';
  stage: 'bootstrapped' | 'seed' | 'series_a_b' | 'series_c_plus' | 'public' | 'acquired' | 'unknown';
  notable_strengths: string[];
  notable_weaknesses: string[];
}

export interface ResultJson {
  schema_version: string;
  input: { idea_text: string; fingerprint: string };
  parsed: {
    industry: string;
    sub_industry: string;
    business_model: string;
    target_customer: string;
    geography: string;
    keywords: string[];
    estimated_complexity: 'low' | 'medium' | 'high';
  };
  competitors: {
    direct: BackendCompetitor[];
    adjacent: BackendCompetitor[];
  };
  market_size: {
    tam_usd: number | null;
    growth_rate_pct: number | null;
    data_quality: 'high' | 'medium' | 'low' | 'unavailable';
    source_notes: string;
  };
  scores: {
    saturation:  { value: number; band: string; breakdown?: Record<string, unknown> };
    difficulty:  { value: number; band: string; breakdown?: Record<string, unknown> };
    opportunity: { value: number; band: string; breakdown?: Record<string, unknown> };
  };
  summary: {
    executive_summary: string;
    where_is_the_gap: string;
    what_would_it_take: {
      capital_estimate: string;
      timeline_to_first_revenue: string;
      key_differentiator_required: string;
      biggest_risk: string;
    };
  };
  metadata: {
    model_versions_used: Record<string, string>;
    total_tokens: { input: number; output: number };
    duration_ms: number;
    warnings: string[];
    degraded: boolean;
  };
}

export interface ApiReport {
  report_id: string;
  idea_text: string;
  status: 'pending' | 'running' | 'complete' | 'failed';
  created_at: string;
  completed_at?: string;
  result_json?: ResultJson;
  pk?: string;
  sk?: string;
  gsi1pk?: string;
  gsi1sk?: string;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json() as Promise<T>;
}

export function createReport(idea_text: string): Promise<ApiReport> {
  return request<ApiReport>('/api/reports', {
    method: 'POST',
    body: JSON.stringify({ idea_text }),
  });
}

export function getReport(report_id: string): Promise<ApiReport> {
  return request<ApiReport>(`/api/reports/${report_id}`);
}

export function listReports(): Promise<ApiReport[]> {
  return request<{ reports: ApiReport[] }>('/api/reports').then(r => r.reports);
}

export function exportReport(report_id: string): Promise<{ report_id: string; format: string; download_url: string }> {
  return request(`/api/reports/${report_id}/export`, {
    method: 'POST',
    body: JSON.stringify({ format: 'csv' }),
  });
}

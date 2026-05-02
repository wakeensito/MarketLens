const ENV_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').trim();
const BASE = ENV_BASE ? ENV_BASE.replace(/\/$/, '') : '';

export interface BackendCompetitor {
  name: string;
  strength: string;
  weakness: string;
  market_position: string;
}

export interface BackendGap {
  title: string;
  description: string;
}

export interface BackendRoadmapPhase {
  phase: string;
  title: string;
  description: string;
}

export interface BackendKeyStat {
  label: string;
  value: string;
}

export interface ResultJson {
  vertical: string;
  oneliner: string;
  saturation_score: number | string;
  saturation_label: string;
  difficulty_score: number | string;
  opportunity_score: number | string;
  market_size: string;
  geography: string;
  business_model: string;
  trend_signal: string;
  recommendation: string;
  competitors: BackendCompetitor[];
  gaps: BackendGap[];
  roadmap: BackendRoadmapPhase[];
  key_stats: BackendKeyStat[];
}

export interface ApiReport {
  report_id: string;
  idea_text: string;
  status: 'pending' | 'running' | 'complete' | 'failed';
  created_at: string;
  completed_at?: string;
  result_json?: ResultJson;
  current_stage?: string;
  pk?: string;
  sk?: string;
  gsi1pk?: string;
  gsi1sk?: string;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = 20_000;

  const upstreamSignal = options?.signal;
  if (upstreamSignal) {
    if (upstreamSignal.aborted) controller.abort();
    else upstreamSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      ...options,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    return res.json() as Promise<T>;
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(`API timeout after ${timeoutMs}ms`, { cause: e });
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
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

const ENV_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').trim();
const BASE = ENV_BASE ? ENV_BASE.replace(/\/$/, '') : '';

/**
 * Thrown for any non-2xx response. Carries status + parsed body so callers
 * can branch on specific error codes (e.g. rate-limit).
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly body?: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
    if (body && typeof body === 'object' && 'code' in body) {
      const c = (body as { code: unknown }).code;
      if (typeof c === 'string') this.code = c;
    }
  }
}

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
  status: 'pending' | 'running' | 'complete' | 'failed' | 'deleted';
  created_at: string;
  completed_at?: string;
  result_json?: ResultJson;
  current_stage?: string;
  pk?: string;
  sk?: string;
  gsi1pk?: string;
  gsi1sk?: string;
}

/* ── Build Brief (Pro) ───────────────────────────────────────
   Flat string-tolerant shapes mirroring result_json conventions
   (string-number scores, object arrays) so the adapter pattern
   carries over. */

export interface BuildBriefCapabilityJson {
  name: string;
  description: string;
  build_or_buy: string;
  recommendation: string;
}

export interface BuildBriefPrimitiveJson {
  primitive: string;
  why: string;
  cloud_examples: string;
}

export interface BuildBriefRiskJson {
  title: string;
  description: string;
}

export interface BuildBriefJson {
  is_tech_dominant: boolean | string;
  complexity_score: number | string;
  complexity_label: string;
  complexity_drivers: string[];
  capabilities: BuildBriefCapabilityJson[];
  foundation: BuildBriefPrimitiveJson[];
  mvp_scope: string;
  effort_estimate: { timeframe: string; team_shape: string };
  technical_risks: BuildBriefRiskJson[];
}

export interface BuildBriefResponse {
  /** null when the report has no brief generated yet (some backends 404 instead). */
  build_brief_json: BuildBriefJson | null;
  build_brief_generated_at: string | null;
  /** True only when the user is free AND has already spent their one lifetime sample. */
  free_brief_used?: boolean;
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
    if (!res.ok) {
      let body: unknown = null;
      try { body = await res.json(); } catch { /* response body wasn't JSON */ }
      const message = (body && typeof body === 'object' && 'error' in body && typeof (body as { error: unknown }).error === 'string')
        ? (body as { error: string }).error
        : `API ${res.status}`;
      throw new ApiError(res.status, message, body);
    }
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
  return request<{ reports: ApiReport[] }>('/api/reports').then(r =>
    r.reports.filter(report => report.status !== 'deleted'),
  );
}

export function deleteReport(report_id: string): Promise<{ message: string }> {
  return request(`/api/reports/${report_id}`, { method: 'DELETE' });
}

export function exportReport(report_id: string): Promise<{ report_id: string; format: string; download_url: string }> {
  return request(`/api/reports/${report_id}/export`, {
    method: 'POST',
    body: JSON.stringify({ format: 'csv' }),
  });
}

/**
 * Submit thumbs-up / thumbs-down feedback on a report, optionally with a
 * free-text comment. Backend accepts `{ rating }` or `{ rating, comment }`
 * and upserts on the report. Uses fetch directly (not `request`) because
 * the endpoint may return 204 No Content, which `request`'s json() parse
 * would reject.
 */
export async function submitFeedback(
  report_id: string,
  rating: 'up' | 'down',
  comment?: string | null,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const payload: { rating: 'up' | 'down'; comment?: string } =
      comment && comment.trim().length > 0
        ? { rating, comment: comment.trim() }
        : { rating };
    const res = await fetch(`${BASE}/api/reports/${encodeURIComponent(report_id)}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      let body: unknown = null;
      try { body = await res.json(); } catch { /* response body wasn't JSON */ }
      const message = (body && typeof body === 'object' && 'error' in body && typeof (body as { error: unknown }).error === 'string')
        ? (body as { error: string }).error
        : `API ${res.status}`;
      throw new ApiError(res.status, message, body);
    }
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch a stored Build Brief for a completed report. 404/null → not generated yet. */
export function getBuildBrief(report_id: string): Promise<BuildBriefResponse> {
  return request<BuildBriefResponse>(`/api/reports/${report_id}/build-brief`);
}

/** Generate (or regenerate) the Build Brief, store it, and return it. */
export function generateBuildBrief(report_id: string): Promise<BuildBriefResponse> {
  return request<BuildBriefResponse>(`/api/reports/${report_id}/build-brief`, {
    method: 'POST',
  });
}

export type BillingPlan = 'pro' | 'pro_annual' | 'max' | 'max_annual';

export interface MeResponse {
  is_authenticated: boolean;
  user_id?: string;
  email?: string;
  plan: string;
  stale?: boolean;
}

export function getMe(): Promise<MeResponse> {
  return request<MeResponse>('/api/me');
}

export function startBillingCheckout(plan: BillingPlan): Promise<{ checkout_url: string }> {
  return request('/api/billing/checkout', {
    method: 'POST',
    body: JSON.stringify({ plan }),
  });
}

export function openBillingPortal(): Promise<{ portal_url: string }> {
  return request('/api/billing/portal', { method: 'POST' });
}

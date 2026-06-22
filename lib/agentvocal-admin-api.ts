import type { PersonaForm, POCConfigPayload } from '@/lib/supabase/poc-config';
import type { VoiceSample } from '@/lib/supabase/voices';
import { axios } from '@/lib/axios';

export type PromptMode = 'chat' | 'voice';

export type PromptConfig = {
  mode: PromptMode;
  content: string;
  metadata: Record<string, unknown>;
  instructions: string[];
  manifest: string;
  blacklist: string[];
  source: string;
  updated_at?: string | null;
};

export type RagDocument = {
  id: number;
  title: string;
  content: string;
  source_format: 'txt' | 'md' | 'csv' | 'audio' | 'video';
  source_type: string;
  metadata: Record<string, unknown>;
  active: boolean;
  original_filename?: string | null;
  mime_type?: string | null;
  created_at: string;
  updated_at: string;
};

export type VoiceConsent = {
  consented_by: string;
  purpose: string;
  created_at: string;
};

export type AnalyticsDashboardPayload = {
  summary: Record<string, unknown>;
  live: Record<string, unknown>;
  activity_history: AnalyticsHistoryPoint[];
  problem_sessions: Array<Record<string, unknown>>;
  missing_topics: Array<Record<string, unknown>>;
  top_documents: Array<Record<string, unknown>>;
  top_users: Array<Record<string, unknown>>;
  open_issues: Array<Record<string, unknown>>;
  quota_overview: Record<string, unknown>;
  quota_blocks: AnalyticsQuotaBlock[];
};

export type AnalyticsDashboardFilters = {
  days?: number;
  mode?: 'all' | 'text' | 'voice';
  channel?: string;
  audience?: 'all' | 'identified' | 'anonymous';
};

export type AnalyticsLivePayload = {
  active_sessions: number;
  active_voice_sessions: number;
  active_text_sessions: number;
  active_users: number;
  active_anonymous_users: number;
  active_identified_users: number;
  peak_concurrent_sessions_today: number;
  window_minutes?: number;
  sessions?: AnalyticsLiveSession[];
  messages?: AnalyticsLiveMessage[];
};

export type AnalyticsLiveSession = {
  session_id: string;
  user_id?: string | null;
  channel: string;
  mode: string;
  status: string;
  session_state: string;
  started_at: string;
  ended_at?: string | null;
  updated_at?: string | null;
  last_activity_at?: string | null;
  message_count: number;
  response_count: number;
  fallback_count: number;
  error_count: number;
  is_anonymous: boolean;
};

export type AnalyticsLiveMessage = {
  id: number;
  session_id?: string | null;
  role: string;
  content: string;
  created_at: string;
  channel: string;
  mode: string;
  user_id?: string | null;
  is_anonymous: boolean;
};

export type AnalyticsUserSessionItem = {
  session_id: string;
  user_id?: string | null;
  channel: string;
  mode: string;
  status: string;
  started_at: string;
  ended_at?: string | null;
  duration_seconds: number;
  message_count: number;
  response_count: number;
  fallback_count: number;
  error_count: number;
  needs_review: boolean;
  review_reason?: string | null;
};

export type AnalyticsHistoryPoint = {
  bucket: string;
  label: string;
  sessions: number;
  sessions_needing_review: number;
  responses: number;
  messages: number;
  voice_seconds: number;
  fallback_count: number;
  error_count: number;
  blocked_count: number;
  total_duration_seconds: number;
};

export type AnalyticsQuotaBlock = {
  id: number;
  user_id?: string | null;
  session_id?: string | null;
  reason: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type AnalyticsUserQuotaSummary = {
  responses_per_hour: { limit: number; used: number; remaining: number };
  responses_per_day: { limit: number; used: number; remaining: number };
  voice_seconds_per_day: { limit: number; used: number; remaining: number };
  concurrency: { user_limit: number; user_active: number; global_limit: number; global_active: number };
  blocked_today: number;
};

export type AnalyticsUserUsagePayload = {
  user_id: string;
  quota: AnalyticsUserQuotaSummary;
  totals: {
    responses: number;
    messages: number;
    voice_seconds: number;
    fallback_count: number;
    errors_count: number;
    blocked_count: number;
    total_sessions: number;
    total_duration_seconds: number;
  };
  history: AnalyticsHistoryPoint[];
  recent_blocks: AnalyticsQuotaBlock[];
};

export type AnalyticsSessionMessage = {
  id: number;
  message_id: string | null;
  role: string;
  content: string;
  feedback_rating?: string | null;
  feedback_comment?: string | null;
  is_flagged?: boolean;
  flag_reason?: string | null;
  created_at: string;
  metadata?: Record<string, unknown>;
};

export type AnalyticsSessionIssue = {
  id: number;
  issue_type: string;
  severity: string;
  description: string;
  suggested_action?: string | null;
  status: string;
  created_at: string;
  metadata: Record<string, unknown>;
};

export type AnalyticsSessionEvent = {
  id: number;
  event_type: string;
  ts: string;
  duration_ms?: number | null;
  metadata: Record<string, unknown>;
};

export type AnalyticsUserSessionsPayload = {
  user_id: string;
  sessions: AnalyticsUserSessionItem[];
};

export type AnalyticsSessionDetailPayload = {
  session: AnalyticsUserSessionItem;
  messages: AnalyticsSessionMessage[];
  issues: AnalyticsSessionIssue[];
  events: AnalyticsSessionEvent[];
};

export async function fetchCloneConfig() {
  return axios.get<POCConfigPayload>('/api/settings/clone');
}

export async function saveCloneConfig(persona: PersonaForm) {
  return axios.postJson<POCConfigPayload>('/api/settings/clone', { persona });
}

export async function fetchPromptConfig(mode: PromptMode) {
  return axios.get<PromptConfig>(`/api/prompt/${mode}`);
}

function analyticsFilterParams(filters: AnalyticsDashboardFilters = {}) {
  const params = new URLSearchParams();
  if (filters.days) {
    params.set('days', String(Math.max(1, Math.min(90, filters.days))));
  }
  if (filters.mode && filters.mode !== 'all') {
    params.set('mode', filters.mode);
  }
  if (filters.channel && filters.channel !== 'all') {
    params.set('channel', filters.channel);
  }
  if (filters.audience && filters.audience !== 'all') {
    params.set('audience', filters.audience);
  }
  return params.toString();
}

export async function fetchAnalyticsDashboard(filters: AnalyticsDashboardFilters = {}) {
  const query = analyticsFilterParams(filters);
  return axios.get<AnalyticsDashboardPayload>(query ? `/api/analytics/dashboard?${query}` : '/api/analytics/dashboard');
}

export async function fetchAnalyticsLive(filters: AnalyticsDashboardFilters = {}) {
  const query = analyticsFilterParams(filters);
  return axios.get<AnalyticsLivePayload>(query ? `/api/analytics/live?${query}` : '/api/analytics/live');
}

export async function fetchAnalyticsHistory(days = 14) {
  return axios.get<{ items: AnalyticsHistoryPoint[] }>(`/api/analytics/history?days=${Math.max(1, Math.min(90, days))}`);
}

export async function fetchAnalyticsUserSessions(userId: string, limit = 20) {
  const params = new URLSearchParams({
    user_id: userId,
    limit: String(Math.max(1, Math.min(100, limit))),
  });
  return axios.get<AnalyticsUserSessionsPayload>(`/api/analytics/user-sessions?${params.toString()}`);
}

export async function fetchAnalyticsSessionDetail(sessionId: string) {
  return axios.get<AnalyticsSessionDetailPayload>(`/api/analytics/sessions/${encodeURIComponent(sessionId)}`);
}

export async function fetchAnalyticsUserUsage(userId: string, days = 14) {
  return axios.get<AnalyticsUserUsagePayload>(`/api/analytics/users/${encodeURIComponent(userId)}/usage?days=${Math.max(1, Math.min(90, days))}`);
}

export async function savePromptConfig(
  mode: PromptMode,
  content: string,
  metadata: Record<string, unknown> = {},
  instructions: string[] = [],
  manifest = '',
  blacklist: string[] = []
) {
  return axios.putJson<PromptConfig>(`/api/prompt/${mode}`, {
    content,
    metadata,
    instructions,
    manifest,
    blacklist,
  });
}

export async function listRagDocuments() {
  const payload = await axios.get<{ items: RagDocument[] }>('/api/rag');
  return payload.items ?? [];
}

export async function createRagDocument(input: {
  title: string;
  content: string;
  source_format: 'txt' | 'md' | 'csv' | 'audio' | 'video';
}) {
  return axios.postJson<RagDocument>('/api/rag', input);
}

export async function updateRagDocument(
  id: number,
  input: Partial<Pick<RagDocument, 'title' | 'content' | 'source_format' | 'active'>>
) {
  return axios.patchJson<RagDocument>(`/api/rag/${id}`, input);
}

export async function uploadRagDocument(file: File, title?: string) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('title', title ?? file.name.replace(/\.[^.]+$/, ''));
  return axios.post<RagDocument>('/api/rag/upload', formData);
}

export async function deleteRagDocument(id: number) {
  return axios.delete<{ deleted: boolean; document_id: number }>(`/api/rag/${id}`);
}

export async function listVoices() {
  return axios.get<VoiceSample[]>('/api/voices');
}

export async function uploadVoice(formData: FormData) {
  return axios.post<VoiceSample>('/api/voices', formData);
}

export async function deleteVoice(id: string) {
  return axios.delete<{ ok: boolean }>(`/api/voices/${id}`);
}

export async function fetchVoiceConsent(voiceId: string) {
  return axios.get<VoiceConsent>(`/api/voices/${voiceId}/consent`);
}

export async function grantVoiceConsent(voiceId: string, input: { consented_by: string; purpose: string }) {
  return axios.postJson<VoiceConsent>(`/api/voices/${voiceId}/consent`, input);
}

export async function revokeVoiceConsent(voiceId: string) {
  return axios.delete<{ ok?: boolean }>(`/api/voices/${voiceId}/consent`);
}

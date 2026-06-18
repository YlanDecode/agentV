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
  problem_sessions: Array<Record<string, unknown>>;
  missing_topics: Array<Record<string, unknown>>;
  top_documents: Array<Record<string, unknown>>;
  top_users: Array<Record<string, unknown>>;
  open_issues: Array<Record<string, unknown>>;
  quota_overview: Record<string, unknown>;
};

export type AnalyticsLivePayload = {
  active_sessions: number;
  active_voice_sessions: number;
  active_text_sessions: number;
  peak_concurrent_sessions_today: number;
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

export type AnalyticsUserSessionsPayload = {
  user_id: string;
  sessions: AnalyticsUserSessionItem[];
};

export type AnalyticsSessionDetailPayload = {
  session: AnalyticsUserSessionItem;
  messages: AnalyticsSessionMessage[];
  issues: AnalyticsSessionIssue[];
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

export async function fetchAnalyticsDashboard() {
  return axios.get<AnalyticsDashboardPayload>('/api/analytics/dashboard');
}

export async function fetchAnalyticsLive() {
  return axios.get<AnalyticsLivePayload>('/api/analytics/live');
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

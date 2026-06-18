import { agentVocalFetch, isAgentVocalEnabled } from '@/lib/backend/agentvocal';

export async function GET(request: Request) {
  if (!isAgentVocalEnabled()) {
    return Response.json(
      { error: 'AGENTVOCAL_API_BASE_URL and AGENTVOCAL_API_KEY must be configured' },
      { status: 400 }
    );
  }

  const url = new URL(request.url);
  const userId = (url.searchParams.get('user_id') || '').trim();
  if (!userId) {
    return Response.json({ error: 'user_id query parameter is required' }, { status: 400 });
  }

  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') || 20)));
  const upstreamPath = `/analytics/user-sessions?user_id=${encodeURIComponent(userId)}&limit=${limit}`;

  try {
    const response = await agentVocalFetch(upstreamPath);
    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: { 'Content-Type': response.headers.get('Content-Type') ?? 'application/json' },
    });
  } catch {
    return Response.json(
      { error: "Impossible de charger les sessions de l'utilisateur." },
      { status: 502 }
    );
  }
}

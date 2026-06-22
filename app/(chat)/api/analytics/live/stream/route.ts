import { agentVocalFetch, isAgentVocalEnabled } from '@/lib/backend/agentvocal';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  if (!isAgentVocalEnabled()) {
    return Response.json(
      { error: 'AGENTVOCAL_API_BASE_URL and AGENTVOCAL_API_KEY must be configured' },
      { status: 400 }
    );
  }

  try {
    const search = new URL(request.url).searchParams.toString();
    const response = await agentVocalFetch(search ? `/analytics/live/stream?${search}` : '/analytics/live/stream', {
      headers: {
        Accept: 'text/event-stream',
      },
    });

    return new Response(response.body, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') ?? 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch {
    return Response.json(
      { error: 'Impossible d\'ouvrir le flux live AgentVOCAL.' },
      { status: 502 }
    );
  }
}

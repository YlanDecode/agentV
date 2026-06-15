import { agentVocalFetch, isAgentVocalEnabled } from '@/lib/backend/agentvocal';

type Params = { params: Promise<{ mode: string }> };

function isPromptMode(mode: string): mode is 'chat' | 'voice' {
  return mode === 'chat' || mode === 'voice';
}

async function forward(response: Response) {
  const body = await response.text();
  return new Response(body, {
    status: response.status,
    headers: { 'Content-Type': response.headers.get('Content-Type') ?? 'application/json' },
  });
}

export async function GET(_request: Request, { params }: Params) {
  if (!isAgentVocalEnabled()) {
    return Response.json(
      { error: 'AGENTVOCAL_API_BASE_URL and AGENTVOCAL_API_KEY must be configured' },
      { status: 400 }
    );
  }

  const { mode } = await params;
  if (!isPromptMode(mode)) {
    return Response.json({ error: 'Mode de prompt invalide.' }, { status: 400 });
  }

  try {
    return forward(await agentVocalFetch(`/prompt/${mode}`));
  } catch {
    return Response.json(
      { error: 'Impossible de charger ce prompt dynamique.' },
      { status: 502 }
    );
  }
}

export async function PUT(request: Request, { params }: Params) {
  if (!isAgentVocalEnabled()) {
    return Response.json(
      { error: 'AGENTVOCAL_API_BASE_URL and AGENTVOCAL_API_KEY must be configured' },
      { status: 400 }
    );
  }

  const { mode } = await params;
  if (!isPromptMode(mode)) {
    return Response.json({ error: 'Mode de prompt invalide.' }, { status: 400 });
  }

  try {
    return forward(
      await agentVocalFetch(`/prompt/${mode}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: await request.text(),
      })
    );
  } catch {
    return Response.json(
      { error: 'Impossible de sauvegarder ce prompt dynamique.' },
      { status: 502 }
    );
  }
}

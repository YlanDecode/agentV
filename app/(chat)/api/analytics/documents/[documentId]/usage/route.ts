import { agentVocalFetch, isAgentVocalEnabled } from '@/lib/backend/agentvocal';

type DocumentUsageRouteParams = {
  params: { documentId: string } | Promise<{ documentId: string }>;
};

export async function GET(request: Request, context: DocumentUsageRouteParams) {
  if (!isAgentVocalEnabled()) {
    return Response.json(
      { error: 'AGENTVOCAL_API_BASE_URL and AGENTVOCAL_API_KEY must be configured' },
      { status: 400 }
    );
  }

  const params = await Promise.resolve(context.params);
  const documentId = String(params.documentId || '').trim();
  if (!documentId) {
    return Response.json({ error: 'document_id is required' }, { status: 400 });
  }

  const search = new URL(request.url).searchParams.toString();

  try {
    const response = await agentVocalFetch(search ? `/analytics/documents/${encodeURIComponent(documentId)}/usage?${search}` : `/analytics/documents/${encodeURIComponent(documentId)}/usage`);
    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: { 'Content-Type': response.headers.get('Content-Type') ?? 'application/json' },
    });
  } catch {
    return Response.json(
      { error: 'Impossible de charger le detail d\'usage de ce document.' },
      { status: 502 }
    );
  }
}

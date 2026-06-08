function getAgentVocalConfig() {
  const baseUrl = process.env.AGENTVOCAL_API_BASE_URL?.trim();
  const apiKey = process.env.AGENTVOCAL_API_KEY?.trim();

  if (!baseUrl || !apiKey) {
    throw new Error(
      "AGENTVOCAL_API_BASE_URL and AGENTVOCAL_API_KEY must be configured"
    );
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    apiKey,
  };
}

export function isAgentVocalEnabled() {
  return Boolean(
    process.env.AGENTVOCAL_API_BASE_URL?.trim() &&
      process.env.AGENTVOCAL_API_KEY?.trim()
  );
}

export async function agentVocalFetch(path: string, init?: RequestInit) {
  const { baseUrl, apiKey } = getAgentVocalConfig();

  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "X-API-Key": apiKey,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
}

async function readUpstreamError(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { detail?: string; error?: string };
    return payload.detail ?? payload.error ?? fallback;
  } catch {
    const text = await response.text();
    return text || fallback;
  }
}

export async function proxyVoiceChatRequest(request: Request) {
  if (!isAgentVocalEnabled()) {
    return Response.json(
      {
        error:
          "AGENTVOCAL_API_BASE_URL and AGENTVOCAL_API_KEY must be configured",
      },
      { status: 400 }
    );
  }

  const body = await request.formData();
  const audio = body.get("audio");

  if (!(audio instanceof File)) {
    return Response.json({ error: "Missing audio file" }, { status: 400 });
  }

  const sessionId = String(body.get("session_id") ?? crypto.randomUUID());
  const channel = String(body.get("channel") ?? "web");
  const userName = String(body.get("user_name") ?? "Utilisateur");
  const voiceUrl = body.get("voice_url") ? String(body.get("voice_url")) : null;
  const voiceId = body.get("voice_id") ? String(body.get("voice_id")) : null;

  const sttFormData = new FormData();
  sttFormData.append("audio", audio);

  const sttResponse = await agentVocalFetch("/stt", {
    method: "POST",
    body: sttFormData,
  });

  if (!sttResponse.ok) {
    const message = await readUpstreamError(
      sttResponse,
      "Voice transcription failed"
    );
    return Response.json({ error: message }, { status: sttResponse.status });
  }

  const sttPayload = (await sttResponse.json()) as { text?: string };
  const transcription = (sttPayload.text ?? "").trim();

  if (!transcription) {
    return Response.json({ error: "empty transcription" }, { status: 422 });
  }

  const chatPayload: Record<string, unknown> = {
    messages: [{ role: "user", content: transcription }],
    mode: "voice",
    session_id: sessionId,
    user_name: userName,
    channel,
  };

  if (voiceUrl) {
    chatPayload.voice_url = voiceUrl;
  }
  if (voiceId) {
    chatPayload.voice_id = voiceId;
  }

  const chatResponse = await agentVocalFetch("/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(chatPayload),
  });

  if (!chatResponse.ok) {
    const message = await readUpstreamError(chatResponse, "Voice request failed");
    return Response.json({ error: message }, { status: chatResponse.status });
  }

  const headers = new Headers();
  headers.set(
    "X-Session-Id",
    chatResponse.headers.get("X-Session-Id") ?? sessionId
  );
  headers.set("X-Transcription", encodeURIComponent(transcription));

  const contentType = chatResponse.headers.get("Content-Type") ?? "application/json";
  if (contentType.includes("application/json")) {
    const payload = (await chatResponse.json()) as {
      text?: string;
      session_id?: string;
    };
    if (payload.session_id) {
      headers.set("X-Session-Id", payload.session_id);
    }
    if (payload.text) {
      headers.set("X-Assistant-Text", encodeURIComponent(payload.text));
    }
    headers.set("Content-Type", "application/json");
    return new Response(JSON.stringify(payload), {
      status: chatResponse.status,
      headers,
    });
  }

  const assistantText = chatResponse.headers.get("X-Assistant-Text");
  if (assistantText) {
    headers.set("X-Assistant-Text", encodeURIComponent(assistantText));
  }
  headers.set("Content-Type", contentType);

  return new Response(await chatResponse.arrayBuffer(), {
    status: chatResponse.status,
    headers,
  });
}

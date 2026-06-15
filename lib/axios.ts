const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

type ErrorPayload = {
  detail?: string;
  error?: string;
  message?: string;
  cause?: string;
};

export class ApiClientError extends Error {
  status: number;
  path: string;
  payload?: unknown;

  constructor(path: string, status: number, message: string, payload?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.path = path;
    this.payload = payload;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function buildUrl(path: string) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${BASE_PATH}${path}`;
}

function defaultErrorMessage(status: number, path: string) {
  switch (status) {
    case 400:
      return 'La requête est invalide.';
    case 401:
      return 'Authentification requise pour accéder à cette ressource.';
    case 403:
      return 'Accès refusé pour cette action.';
    case 404:
      return `Endpoint introuvable: ${path}`;
    case 409:
      return 'Conflit détecté lors de la sauvegarde.';
    case 422:
      return 'Les données envoyées sont incomplètes ou invalides.';
    case 500:
      return 'Erreur interne du serveur.';
    case 502:
      return 'Le frontend n’a pas réussi à joindre correctement le backend AgentVOCAL.';
    case 503:
      return 'Le service est temporairement indisponible.';
    default:
      return `Erreur API (${status}).`;
  }
}

async function readResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  try {
    const text = await response.text();
    return text || null;
  } catch {
    return null;
  }
}

function resolveErrorMessage(path: string, status: number, payload: unknown) {
  if (typeof payload === 'string' && payload.trim()) {
    return payload.trim();
  }

  if (isPlainObject(payload)) {
    const data = payload as ErrorPayload;
    const explicitMessage = data.detail ?? data.error ?? data.message ?? data.cause;

    if (explicitMessage?.trim()) {
      return explicitMessage.trim();
    }
  }

  return defaultErrorMessage(status, path);
}

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: BodyInit | null;
};

async function request<T>(path: string, init: RequestOptions = {}): Promise<T> {
  const url = buildUrl(path);

  let response: Response;

  try {
    response = await fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin',
      ...init,
    });
  } catch {
    throw new ApiClientError(
      path,
      0,
      'Impossible de joindre l’API. Vérifiez votre connexion ou la disponibilité du service.'
    );
  }

  const payload = await readResponseBody(response);

  if (!response.ok) {
    throw new ApiClientError(path, response.status, resolveErrorMessage(path, response.status, payload), payload);
  }

  return payload as T;
}

export const axios = {
  get<T>(path: string) {
    return request<T>(path, { method: 'GET' });
  },

  post<T>(path: string, body?: BodyInit | null, init?: Omit<RequestOptions, 'method' | 'body'>) {
    return request<T>(path, { ...init, method: 'POST', body: body ?? null });
  },

  postJson<T>(path: string, body: unknown, init?: Omit<RequestOptions, 'method' | 'body'>) {
    return request<T>(path, {
      ...init,
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
      body: JSON.stringify(body),
    });
  },

  putJson<T>(path: string, body: unknown, init?: Omit<RequestOptions, 'method' | 'body'>) {
    return request<T>(path, {
      ...init,
      method: 'PUT',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
      body: JSON.stringify(body),
    });
  },

  patchJson<T>(path: string, body: unknown, init?: Omit<RequestOptions, 'method' | 'body'>) {
    return request<T>(path, {
      ...init,
      method: 'PATCH',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
      body: JSON.stringify(body),
    });
  },

  delete<T>(path: string, init?: Omit<RequestOptions, 'method'>) {
    return request<T>(path, { ...init, method: 'DELETE' });
  },
};

export function getApiErrorMessage(error: unknown, fallback = 'Une erreur inattendue est survenue.') {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

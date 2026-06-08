/**
 * SQL à exécuter une fois dans Supabase :
 *
 * CREATE TABLE voice_samples (
 *   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *   name text NOT NULL,
 *   url text NOT NULL,
 *   reference_text text DEFAULT '',
 *   created_at timestamptz DEFAULT now()
 * );
 *
 * Storage : créer un bucket "voice-samples" avec accès public activé.
 * Dashboard Supabase → Storage → New bucket → nom: voice-samples → Public: ON
 */

export type VoiceSample = {
  id: string;
  name: string;
  url: string;
  reference_text: string;
  noiz_voice_id?: string | null;
  created_at: string;
};

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing");
  }
  return { url, key };
}

async function supabaseFetch(path: string, init?: RequestInit) {
  const { url, key } = getSupabaseConfig();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Supabase failed (${res.status}) for ${path}`);
  }
  return res;
}

export async function listVoiceSamples(): Promise<VoiceSample[]> {
  const res = await supabaseFetch(
    "voice_samples?select=id,name,url,reference_text,created_at&order=created_at.desc"
  );
  return res.json() as Promise<VoiceSample[]>;
}

export async function createVoiceSample(data: {
  name: string;
  url: string;
  reference_text: string;
}): Promise<VoiceSample> {
  const res = await supabaseFetch("voice_samples", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(data),
  });
  const rows = (await res.json()) as VoiceSample[];
  return rows[0];
}

export async function deleteVoiceSample(id: string): Promise<void> {
  await supabaseFetch(`voice_samples?id=eq.${id}`, { method: "DELETE" });
}

export async function uploadVoiceToSupabase(
  filename: string,
  buffer: ArrayBuffer,
  contentType: string
): Promise<string> {
  const { url, key } = getSupabaseConfig();

  const res = await fetch(
    `${url}/storage/v1/object/voice-samples/${filename}`,
    {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": contentType,
        "x-upsert": "true",
      },
      body: buffer,
      cache: "no-store",
    }
  );

  if (!res.ok) {
    throw new Error(`Supabase Storage upload failed (${res.status}): ${await res.text()}`);
  }

  return `${url}/storage/v1/object/public/voice-samples/${filename}`;
}

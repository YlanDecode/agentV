import {
  getPOCConfig,
  savePOCConfig,
  type PersonaForm,
} from "@/lib/supabase/poc-config";

export async function GET() {
  const config = await getPOCConfig();
  return Response.json(config);
}

export async function POST(request: Request) {
  const body = (await request.json()) as { persona: PersonaForm };

  await savePOCConfig(body.persona);

  const config = await getPOCConfig();
  return Response.json(config);
}

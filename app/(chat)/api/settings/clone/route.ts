import {
  getPOCConfig,
  savePOCConfig,
  type PersonaForm,
} from "@/lib/supabase/poc-config";

export async function GET() {
  try {
    const config = await getPOCConfig();
    return Response.json(config);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Impossible de charger la configuration Persona depuis Supabase.',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { persona: PersonaForm };

    await savePOCConfig(body.persona);

    const config = await getPOCConfig();
    return Response.json(config);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Impossible de sauvegarder la configuration Persona.',
      },
      { status: 500 }
    );
  }
}

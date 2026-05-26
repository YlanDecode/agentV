import { createVoiceSample, listVoiceSamples, uploadVoiceToSupabase } from "@/lib/supabase/voices";

export async function GET() {
  try {
    const voices = await listVoiceSamples();
    return Response.json(voices);
  } catch {
    return Response.json([]);
  }
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const audio = formData.get("audio") as File | null;
  const name = String(formData.get("name") ?? "Voix sans nom").trim();
  const referenceText = String(formData.get("reference_text") ?? "").trim();

  if (!audio || audio.size === 0) {
    return Response.json({ error: "Audio manquant" }, { status: 400 });
  }

  const ext = audio.type.includes("wav")
    ? "wav"
    : audio.type.includes("ogg")
      ? "ogg"
      : audio.type.includes("mp4")
        ? "m4a"
        : "webm";

  const safeName = name.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
  const filename = `${Date.now()}-${safeName}.${ext}`;
  const fileBuffer = await audio.arrayBuffer();

  const publicUrl = await uploadVoiceToSupabase(filename, fileBuffer, audio.type || "audio/webm");
  const voice = await createVoiceSample({
    name,
    url: publicUrl,
    reference_text: referenceText,
  });

  return Response.json(voice, { status: 201 });
}

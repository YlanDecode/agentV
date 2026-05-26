import { deleteVoiceSample } from "@/lib/supabase/voices";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await deleteVoiceSample(id);
  return Response.json({ ok: true });
}

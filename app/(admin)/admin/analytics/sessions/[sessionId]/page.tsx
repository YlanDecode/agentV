import { redirect } from "next/navigation";

type SessionDetailPageProps = {
  params: Promise<{ sessionId: string }>;
};

export default async function SessionDetailPage({ params }: SessionDetailPageProps) {
  const resolvedParams = await params;
  const sessionId = decodeURIComponent((resolvedParams.sessionId || "").trim());
  redirect(`/admin/analytics/user-sessions?user_id=${encodeURIComponent(`session:${sessionId}`)}&session_id=${encodeURIComponent(sessionId)}`);
}

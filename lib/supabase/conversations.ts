type ConversationRecord = {
  sessionId: string;
  userName: string;
  userMessage: string;
  botResponse: string;
  channel: string;
};

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return null;
  }

  return { url, key };
}

export async function saveConversationToSupabase(record: ConversationRecord) {
  const config = getSupabaseConfig();
  if (!config) {
    return;
  }

  const response = await fetch(`${config.url}/rest/v1/conversations`, {
    method: "POST",
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      session_id: record.sessionId,
      user_name: record.userName,
      user_message: record.userMessage,
      bot_response: record.botResponse,
      channel: record.channel,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Supabase conversations insert failed (${response.status})`
    );
  }
}

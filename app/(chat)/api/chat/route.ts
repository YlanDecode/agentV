import { geolocation, ipAddress } from "@vercel/functions";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  stepCountIs,
  streamText,
} from "ai";
import { checkBotId } from "botid/server";
import { after } from "next/server";
import { createResumableStreamContext } from "resumable-stream";
import { auth, type UserType } from "@/app/(auth)/auth";
import { entitlementsByUserType } from "@/lib/ai/entitlements";
import {
  allowedModelIds,
  chatModels,
  DEFAULT_CHAT_MODEL,
  getCapabilities,
} from "@/lib/ai/models";
import { type RequestHints, systemPrompt } from "@/lib/ai/prompts";
import { getLanguageModel } from "@/lib/ai/providers";
import { createDocument } from "@/lib/ai/tools/create-document";
import { editDocument } from "@/lib/ai/tools/edit-document";
import { getWeather } from "@/lib/ai/tools/get-weather";
import { requestSuggestions } from "@/lib/ai/tools/request-suggestions";
import { updateDocument } from "@/lib/ai/tools/update-document";
import { isProductionEnvironment } from "@/lib/constants";
import {
  createStreamId,
  deleteChatById,
  getChatById,
  getMessageCountByUserId,
  getMessagesByChatId,
  saveChat,
  saveMessages,
  updateChatTitleById,
  updateMessage,
} from "@/lib/db/queries";
import type { DBMessage } from "@/lib/db/schema";
import { ChatbotError } from "@/lib/errors";
import { groqChatCompletionStream, isGroqCloneEnabled } from "@/lib/clone/groq";
import { isN8nModeEnabled, sendTextToN8n } from "@/lib/n8n/client";
import { checkIpRateLimit } from "@/lib/ratelimit";
import { saveConversationToSupabase } from "@/lib/supabase/conversations";
import { buildSystemPrompt, getCloneSettings } from "@/lib/supabase/poc-config";
import { agentVocalFetch, isAgentVocalEnabled } from "@/lib/backend/agentvocal";
import type { ChatMessage } from "@/lib/types";
import { convertToUIMessages, generateUUID } from "@/lib/utils";
import { generateTitleFromUserMessage } from "../../actions";
import { type PostRequestBody, postRequestBodySchema } from "./schema";

export const maxDuration = 60;

function getStreamContext() {
  try {
    return createResumableStreamContext({ waitUntil: after });
  } catch (_) {
    return null;
  }
}

export { getStreamContext };

function splitForStreaming(text: string, chunkSize = 14) {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += chunkSize) {
    chunks.push(text.slice(index, index + chunkSize));
  }
  return chunks;
}

function extractTextParts(parts: Array<{ type?: string; text?: string }> | undefined) {
  return (parts ?? [])
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join(" ")
    .trim();
}

function extractDeltaFromSseData(data: string) {
  const trimmed = data.trim();
  if (!trimmed || trimmed === "[DONE]") {
    return "";
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;

    const directText = parsed.text;
    if (typeof directText === "string") {
      return directText;
    }

    const directResponse = parsed.response;
    if (typeof directResponse === "string") {
      return directResponse;
    }

    const choices = parsed.choices;
    if (Array.isArray(choices) && choices.length > 0) {
      const first = choices[0] as Record<string, unknown>;
      const delta = first.delta as Record<string, unknown> | undefined;
      if (delta && typeof delta.content === "string") {
        return delta.content;
      }
      if (typeof first.text === "string") {
        return first.text;
      }
      const message = first.message as Record<string, unknown> | undefined;
      if (message && typeof message.content === "string") {
        return message.content;
      }
    }
  } catch {
    return trimmed;
  }

  return "";
}

async function streamN8nTextToUi({
  response,
  writeDelta,
  messageId,
}: {
  response: Response;
  writeDelta: (part: { type: "text-delta"; id: string; delta: string }) => void;
  messageId: string;
}) {
  const body = response.body;
  if (!body) {
    return "";
  }

  const contentType = response.headers.get("content-type") ?? "";
  const isSse = contentType.includes("text/event-stream");
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";

  if (!isSse) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      const chunk = decoder.decode(value, { stream: true });
      if (!chunk) {
        continue;
      }
      fullText += chunk;
      writeDelta({ type: "text-delta", id: messageId, delta: chunk });
    }

    return fullText.trim();
  }

  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      const lines = event.split("\n");
      for (const line of lines) {
        if (!line.startsWith("data:")) {
          continue;
        }

        const payload = line.slice(5);
        const delta = extractDeltaFromSseData(payload);
        if (!delta) {
          continue;
        }

        fullText += delta;
        writeDelta({ type: "text-delta", id: messageId, delta });
      }
    }
  }

  return fullText.trim();
}

async function requestAgentVocalTextResponse({
  chatId,
  messages,
  userId,
  userName,
}: {
  chatId: string;
  messages: Array<{ role: string; content: string }>;
  userId?: string | null;
  userName: string;
}) {
  const response = await agentVocalFetch("/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages,
      mode: "text",
      session_id: chatId,
      user_id: userId ?? undefined,
      user_name: userName,
      channel: "web",
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { detail?: string; error?: string; message?: string }
      | null;
    throw new Error(
      payload?.detail ?? payload?.error ?? payload?.message ?? "AgentVOCAL text request failed"
    );
  }

  const payload = (await response.json()) as {
    text?: string;
    session_id?: string;
  };

  return {
    text: payload.text?.trim() ?? "",
    sessionId: payload.session_id ?? chatId,
  };
}

async function trackAgentVocalTextTurn({
  chatId,
  userText,
  assistantText,
  userId,
  userName,
  metadata,
}: {
  chatId: string;
  userText: string;
  assistantText: string;
  userId?: string | null;
  userName: string;
  metadata?: Record<string, unknown>;
}) {
  if (!isAgentVocalEnabled() || !userText.trim() || !assistantText.trim()) {
    return;
  }

  await agentVocalFetch("/analytics/track-text-turn", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session_id: chatId,
      user_id: userId ?? undefined,
      user_name: userName,
      channel: "web",
      mode: "text",
      user_message: userText,
      assistant_message: assistantText,
      metadata: metadata ?? {},
    }),
  });
}

async function trackAgentVocalSessionPresence({
  chatId,
  userId,
  userName,
  mode = "text",
  state = "start",
  status = "completed",
  metadata,
}: {
  chatId: string;
  userId?: string | null;
  userName: string;
  mode?: "text" | "voice";
  state?: "start" | "heartbeat" | "end";
  status?: "active" | "completed" | "interrupted" | "blocked" | "error";
  metadata?: Record<string, unknown>;
}) {
  if (!isAgentVocalEnabled() || !chatId.trim()) {
    return;
  }

  await agentVocalFetch("/analytics/session-presence", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session_id: chatId,
      user_id: userId ?? undefined,
      user_name: userName,
      channel: "web",
      mode,
      state,
      status,
      metadata: metadata ?? {},
    }),
  });
}

export async function POST(request: Request) {
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (_) {
    return new ChatbotError("bad_request:api").toResponse();
  }

  try {
    const {
      id,
      message,
      messages,
      conversationMessages,
      selectedChatModel,
      selectedVisibilityType,
    } = requestBody;

    const [, session] = await Promise.all([
      checkBotId().catch(() => null),
      auth(),
    ]);

    const chatModel = allowedModelIds.has(selectedChatModel)
      ? selectedChatModel
      : DEFAULT_CHAT_MODEL;

    await checkIpRateLimit(ipAddress(request));

    const isAnonymousMode =
      !session?.user && (isGroqCloneEnabled() || isN8nModeEnabled());

    if (!session?.user && !isAnonymousMode) {
      return new ChatbotError("unauthorized:chat").toResponse();
    }

    const displayName =
      session?.user?.email ??
      session?.user?.name ??
      session?.user?.id ??
      "Utilisateur";

    if (message?.role === "user") {
      try {
        await trackAgentVocalSessionPresence({
          chatId: id,
          userId: session?.user?.id,
          userName: displayName,
          mode: "text",
          state: "start",
          status: "active",
          metadata: {
            source: "next-ai-sdk",
            model: selectedChatModel,
          },
        });
      } catch (error) {
        console.error("Failed to mark live session start", error);
      }
    }

    if (isAnonymousMode && message?.role === "user") {
      const text = message.parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join(" ")
        .trim();

      if (!text) {
        return new ChatbotError("bad_request:api").toResponse();
      }

      if (isGroqCloneEnabled()) {
        if (isAgentVocalEnabled()) {
          const history = (conversationMessages ?? []).flatMap((currentMessage) => {
            const textContent = currentMessage.parts
              .filter((part) => "type" in part && part.type === "text")
              .map((part) => String((part as { text?: string }).text ?? ""))
              .join(" ")
              .trim();

            if (!textContent) {
              return [];
            }

            return [{ role: currentMessage.role, content: textContent }];
          });

          const assistantMessageId = generateUUID();
          let assistantText = "";

          const stream = createUIMessageStream({
            execute: async ({ writer }) => {
              writer.write({ type: "text-start", id: assistantMessageId });
              const result = await requestAgentVocalTextResponse({
                chatId: id,
                messages: [...history, { role: "user" as const, content: text }],
                userName: displayName,
              });
              assistantText = result.text;

              for (const chunk of splitForStreaming(assistantText)) {
                writer.write({
                  type: "text-delta",
                  id: assistantMessageId,
                  delta: chunk,
                });
                await new Promise((resolve) => setTimeout(resolve, 20));
              }

              writer.write({ type: "text-end", id: assistantMessageId });
            },
            generateId: generateUUID,
            onFinish: async () => {
              if (!assistantText) {
                return;
              }

              try {
                await trackAgentVocalTextTurn({
                  chatId: id,
                  userText: text,
                  assistantText,
                  userName: displayName,
                  metadata: {
                    source: "agentvocal-anonymous",
                    model: "agentvocal",
                  },
                });
                await saveConversationToSupabase({
                  sessionId: id,
                  userName: displayName,
                  userMessage: text,
                  botResponse: assistantText,
                  channel: "web",
                });
              } catch (error) {
                console.error("Failed to save anonymous conversation", error);
              }
            },
            onError: () => "Oops, an error occurred!",
          });

          return createUIMessageStreamResponse({ stream });
        }

        const cloneSettings = await getCloneSettings();
        const systemContent = await buildSystemPrompt({ mode: "text" });
        const history = (conversationMessages ?? []).flatMap(
          (currentMessage) => {
            const textContent = currentMessage.parts
              .filter((part) => "type" in part && part.type === "text")
              .map((part) => String((part as { text?: string }).text ?? ""))
              .join(" ")
              .trim();

            if (!textContent) {
              return [];
            }

            return [
              {
                role: currentMessage.role,
                content: textContent,
              },
            ];
          }
        );

        const groqResponse = await groqChatCompletionStream(
          [{ role: "system", content: systemContent }, ...history],
          cloneSettings.groqChatModel
        );

        const assistantMessageId = generateUUID();
        let assistantText = "";

        const stream = createUIMessageStream({
          execute: async ({ writer }) => {
            writer.write({ type: "text-start", id: assistantMessageId });
            assistantText = await streamN8nTextToUi({
              response: groqResponse,
              writeDelta: (part) => writer.write(part),
              messageId: assistantMessageId,
            });
            writer.write({ type: "text-end", id: assistantMessageId });
          },
          generateId: generateUUID,
          onFinish: async () => {
            if (!assistantText) {
              return;
            }

            try {
              await saveConversationToSupabase({
                sessionId: id,
                userName: displayName,
                userMessage: text,
                botResponse: assistantText,
                channel: "web",
              });
            } catch (error) {
              console.error("Failed to save anonymous conversation", error);
            }
          },
          onError: () => "Oops, an error occurred!",
        });

        return createUIMessageStreamResponse({ stream });
      }

      if (isAgentVocalEnabled()) {
        const trackedUserId = session?.user?.id ?? undefined;
        const history = (conversationMessages ?? []).flatMap((currentMessage) => {
          const textContent = currentMessage.parts
            .filter((part) => "type" in part && part.type === "text")
            .map((part) => String((part as { text?: string }).text ?? ""))
            .join(" ")
            .trim();

          if (!textContent) {
            return [];
          }

          return [{ role: currentMessage.role, content: textContent }];
        });

        const assistantMessageId = generateUUID();
        let assistantText = "";
        const stream = createUIMessageStream({
          execute: async ({ writer }) => {
            writer.write({ type: "text-start", id: assistantMessageId });
            const result = await requestAgentVocalTextResponse({
              chatId: id,
              messages: [...history, { role: "user" as const, content: text }],
              userName: displayName,
            });
            assistantText = result.text;

            for (const chunk of splitForStreaming(assistantText)) {
              writer.write({
                type: "text-delta",
                id: assistantMessageId,
                delta: chunk,
              });
              await new Promise((resolve) => setTimeout(resolve, 20));
            }

            writer.write({ type: "text-end", id: assistantMessageId });
          },
          generateId: generateUUID,
          onFinish: async () => {
            if (!assistantText) {
              return;
            }

            try {
              await trackAgentVocalTextTurn({
                chatId: id,
                userText: text,
                assistantText,
                userId: trackedUserId,
                userName: displayName,
                metadata: {
                  source: "agentvocal-authenticated",
                  model: "agentvocal",
                },
              });
              await saveConversationToSupabase({
                sessionId: id,
                userName: displayName,
                userMessage: text,
                botResponse: assistantText,
                channel: "web",
              });
            } catch (error) {
              console.error("Failed to save anonymous conversation", error);
            }
          },
          onError: () => "Oops, an error occurred!",
        });

        return createUIMessageStreamResponse({ stream });
      }

      const n8nResponse = await sendTextToN8n({
        session_id: id,
        message: text,
        channel: "web",
        user_name: displayName,
      });

      const assistantMessageId = generateUUID();
      let assistantText = "";
      const stream = createUIMessageStream({
        execute: async ({ writer }) => {
          writer.write({ type: "text-start", id: assistantMessageId });

          if (
            (n8nResponse.headers.get("content-type") ?? "").includes(
              "application/json"
            )
          ) {
            const payload = (await n8nResponse.json()) as { response?: string };
            assistantText = payload.response?.trim() ?? "";

            for (const chunk of splitForStreaming(assistantText)) {
              writer.write({
                type: "text-delta",
                id: assistantMessageId,
                delta: chunk,
              });
              await new Promise((resolve) => setTimeout(resolve, 20));
            }
          } else {
            assistantText = await streamN8nTextToUi({
              response: n8nResponse,
              writeDelta: (part) => writer.write(part),
              messageId: assistantMessageId,
            });
          }

          writer.write({ type: "text-end", id: assistantMessageId });
        },
        generateId: generateUUID,
        onFinish: async () => {
          if (!assistantText) {
            return;
          }

          try {
            await saveConversationToSupabase({
              sessionId: id,
              userName: displayName,
              userMessage: text,
              botResponse: assistantText,
              channel: "web",
            });
          } catch (error) {
            console.error("Failed to save anonymous conversation", error);
          }
        },
        onError: () => "Oops, an error occurred!",
      });

      return createUIMessageStreamResponse({ stream });
    }

    if (!session?.user) {
      return new ChatbotError("unauthorized:chat").toResponse();
    }

    const userType: UserType = session.user.type;

    const messageCount = await getMessageCountByUserId({
      id: session.user.id,
      differenceInHours: 1,
    });

    if (messageCount > entitlementsByUserType[userType].maxMessagesPerHour) {
      return new ChatbotError("rate_limit:chat").toResponse();
    }

    const isToolApprovalFlow = Boolean(messages);

    const chat = await getChatById({ id });
    let messagesFromDb: DBMessage[] = [];
    let titlePromise: Promise<string> | null = null;

    if (chat) {
      if (chat.userId !== session.user.id) {
        return new ChatbotError("forbidden:chat").toResponse();
      }
      messagesFromDb = await getMessagesByChatId({ id });
    } else if (message?.role === "user") {
      await saveChat({
        id,
        userId: session.user.id,
        title: "New chat",
        visibility: selectedVisibilityType,
      });
      titlePromise = generateTitleFromUserMessage({ message });
    }

    let uiMessages: ChatMessage[];

    if (isToolApprovalFlow && messages) {
      const dbMessages = convertToUIMessages(messagesFromDb);
      const approvalStates = new Map(
        messages.flatMap(
          (m) =>
            m.parts
              ?.filter(
                (p: Record<string, unknown>) =>
                  p.state === "approval-responded" ||
                  p.state === "output-denied"
              )
              .map((p: Record<string, unknown>) => [
                String(p.toolCallId ?? ""),
                p,
              ]) ?? []
        )
      );
      uiMessages = dbMessages.map((msg) => ({
        ...msg,
        parts: msg.parts.map((part) => {
          if (
            "toolCallId" in part &&
            approvalStates.has(String(part.toolCallId))
          ) {
            return { ...part, ...approvalStates.get(String(part.toolCallId)) };
          }
          return part;
        }),
      })) as ChatMessage[];
    } else {
      uiMessages = [
        ...convertToUIMessages(messagesFromDb),
        message as ChatMessage,
      ];
    }

    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      longitude,
      latitude,
      city,
      country,
    };

    if (message?.role === "user") {
      await saveMessages({
        messages: [
          {
            chatId: id,
            id: message.id,
            role: "user",
            parts: message.parts,
            attachments: [],
            createdAt: new Date(),
          },
        ],
      });
    }

    if (isGroqCloneEnabled() && message?.role === "user") {
      if (isAgentVocalEnabled()) {
        const history = uiMessages.flatMap((currentMessage) => {
          const textContent = currentMessage.parts
            .filter((part) => "type" in part && part.type === "text")
            .map((part) => String((part as { text?: string }).text ?? ""))
            .join(" ")
            .trim();

          if (!textContent) {
            return [];
          }

          return [{ role: currentMessage.role, content: textContent }];
        });

        const assistantMessageId = generateUUID();
        let assistantText = "";

        const stream = createUIMessageStream({
          execute: async ({ writer }) => {
            writer.write({ type: "text-start", id: assistantMessageId });
            const result = await requestAgentVocalTextResponse({
              chatId: id,
              messages: history,
              userId: session.user.id,
              userName: displayName,
            });
            assistantText = result.text;

            for (const chunk of splitForStreaming(assistantText)) {
              writer.write({
                type: "text-delta",
                id: assistantMessageId,
                delta: chunk,
              });
              await new Promise((resolve) => setTimeout(resolve, 20));
            }

            writer.write({ type: "text-end", id: assistantMessageId });
          },
          generateId: generateUUID,
          onFinish: async () => {
            if (!assistantText) {
              return;
            }

            await saveMessages({
              messages: [
                {
                  id: assistantMessageId,
                  role: "assistant",
                  parts: [{ type: "text", text: assistantText }],
                  createdAt: new Date(),
                  attachments: [],
                  chatId: id,
                },
              ],
            });
          },
          onError: () => "Oops, an error occurred!",
        });

        return createUIMessageStreamResponse({ stream });
      }

      const cloneSettings = await getCloneSettings();
      const systemContent = await buildSystemPrompt({ mode: "text" });
      const text = message.parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join(" ")
        .trim();

      if (!text) {
        return new ChatbotError("bad_request:api").toResponse();
      }

      const groqResponse = await groqChatCompletionStream(
        [
          {
            role: "system",
            content: systemContent,
          },
          {
            role: "user",
            content: text,
          },
        ],
        cloneSettings.groqChatModel
      );

      const assistantMessageId = generateUUID();
      let assistantText = "";

      const stream = createUIMessageStream({
        execute: async ({ writer }) => {
          writer.write({ type: "text-start", id: assistantMessageId });
          assistantText = await streamN8nTextToUi({
            response: groqResponse,
            writeDelta: (part) => writer.write(part),
            messageId: assistantMessageId,
          });
          writer.write({ type: "text-end", id: assistantMessageId });
        },
        generateId: generateUUID,
        onFinish: async () => {
          if (!assistantText) {
            return;
          }

          await saveMessages({
            messages: [
              {
                id: assistantMessageId,
                role: "assistant",
                parts: [{ type: "text", text: assistantText }],
                createdAt: new Date(),
                attachments: [],
                chatId: id,
              },
            ],
          });
        },
        onError: () => "Oops, an error occurred!",
      });

      return createUIMessageStreamResponse({ stream });
    }

    if (isN8nModeEnabled() && message?.role === "user") {
      if (isAgentVocalEnabled()) {
        const history = uiMessages.flatMap((currentMessage) => {
          const textContent = currentMessage.parts
            .filter((part) => "type" in part && part.type === "text")
            .map((part) => String((part as { text?: string }).text ?? ""))
            .join(" ")
            .trim();

          if (!textContent) {
            return [];
          }

          return [{ role: currentMessage.role, content: textContent }];
        });

        const assistantMessageId = generateUUID();
        let assistantText = "";

        const stream = createUIMessageStream({
          execute: async ({ writer }) => {
            writer.write({ type: "text-start", id: assistantMessageId });
            const result = await requestAgentVocalTextResponse({
              chatId: id,
              messages: history,
              userId: session.user.id,
              userName: displayName,
            });
            assistantText = result.text;

            for (const chunk of splitForStreaming(assistantText)) {
              writer.write({
                type: "text-delta",
                id: assistantMessageId,
                delta: chunk,
              });
              await new Promise((resolve) => setTimeout(resolve, 20));
            }

            writer.write({ type: "text-end", id: assistantMessageId });
          },
          generateId: generateUUID,
          onFinish: async () => {
            if (!assistantText) {
              return;
            }

            await saveMessages({
              messages: [
                {
                  id: assistantMessageId,
                  role: "assistant",
                  parts: [{ type: "text", text: assistantText }],
                  createdAt: new Date(),
                  attachments: [],
                  chatId: id,
                },
              ],
            });
          },
          onError: () => "Oops, an error occurred!",
        });

        return createUIMessageStreamResponse({ stream });
      }

      const text = message.parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join(" ")
        .trim();

      if (!text) {
        return new ChatbotError("bad_request:api").toResponse();
      }

      const n8nResponse = await sendTextToN8n({
        session_id: id,
        message: text,
        channel: "web",
        user_name:
          session.user.email ?? session.user.name ?? session.user.id ?? "User",
      });

      const assistantMessageId = generateUUID();
      let assistantText = "";
      const stream = createUIMessageStream({
        execute: async ({ writer }) => {
          writer.write({ type: "text-start", id: assistantMessageId });

          if (
            (n8nResponse.headers.get("content-type") ?? "").includes(
              "application/json"
            )
          ) {
            const payload = (await n8nResponse.json()) as { response?: string };
            assistantText = payload.response?.trim() ?? "";

            for (const chunk of splitForStreaming(assistantText)) {
              writer.write({
                type: "text-delta",
                id: assistantMessageId,
                delta: chunk,
              });
              await new Promise((resolve) => setTimeout(resolve, 20));
            }
          } else {
            assistantText = await streamN8nTextToUi({
              response: n8nResponse,
              writeDelta: (part) => writer.write(part),
              messageId: assistantMessageId,
            });
          }

          writer.write({ type: "text-end", id: assistantMessageId });
        },
        generateId: generateUUID,
        onFinish: async () => {
          if (!assistantText) {
            return;
          }

          await saveMessages({
            messages: [
              {
                id: assistantMessageId,
                role: "assistant",
                parts: [{ type: "text", text: assistantText }],
                createdAt: new Date(),
                attachments: [],
                chatId: id,
              },
            ],
          });
        },
        onError: () => "Oops, an error occurred!",
      });

      return createUIMessageStreamResponse({ stream });
    }

    const modelConfig = chatModels.find((m) => m.id === chatModel);
    const modelCapabilities = await getCapabilities();
    const capabilities = modelCapabilities[chatModel];
    const isReasoningModel = capabilities?.reasoning === true;
    const supportsTools = capabilities?.tools === true;

    const modelMessages = await convertToModelMessages(uiMessages);

    const stream = createUIMessageStream({
      originalMessages: isToolApprovalFlow ? uiMessages : undefined,
      execute: async ({ writer: dataStream }) => {
        const result = streamText({
          model: getLanguageModel(chatModel),
          system: systemPrompt({ requestHints, supportsTools }),
          messages: modelMessages,
          stopWhen: stepCountIs(5),
          experimental_activeTools:
            isReasoningModel && !supportsTools
              ? []
              : [
                  "getWeather",
                  "createDocument",
                  "editDocument",
                  "updateDocument",
                  "requestSuggestions",
                ],
          providerOptions: {
            ...(modelConfig?.gatewayOrder && {
              gateway: { order: modelConfig.gatewayOrder },
            }),
            ...(modelConfig?.reasoningEffort && {
              openai: { reasoningEffort: modelConfig.reasoningEffort },
            }),
          },
          tools: {
            getWeather,
            createDocument: createDocument({
              session,
              dataStream,
              modelId: chatModel,
            }),
            editDocument: editDocument({ dataStream, session }),
            updateDocument: updateDocument({
              session,
              dataStream,
              modelId: chatModel,
            }),
            requestSuggestions: requestSuggestions({
              session,
              dataStream,
              modelId: chatModel,
            }),
          },
          experimental_telemetry: {
            isEnabled: isProductionEnvironment,
            functionId: "stream-text",
          },
        });

        dataStream.merge(
          result.toUIMessageStream({ sendReasoning: isReasoningModel })
        );

        if (titlePromise) {
          try {
            const title = await titlePromise;
            dataStream.write({ type: "data-chat-title", data: title });
            updateChatTitleById({ chatId: id, title });
          } catch (_) {
            /* non-fatal */
          }
        }
      },
      generateId: generateUUID,
      onFinish: async ({ messages: finishedMessages }) => {
        if (isToolApprovalFlow) {
          for (const finishedMsg of finishedMessages) {
            const existingMsg = uiMessages.find((m) => m.id === finishedMsg.id);
            if (existingMsg) {
              await updateMessage({
                id: finishedMsg.id,
                parts: finishedMsg.parts,
              });
            } else {
              await saveMessages({
                messages: [
                  {
                    id: finishedMsg.id,
                    role: finishedMsg.role,
                    parts: finishedMsg.parts,
                    createdAt: new Date(),
                    attachments: [],
                    chatId: id,
                  },
                ],
              });
            }
          }
        } else if (finishedMessages.length > 0) {
          await saveMessages({
            messages: finishedMessages.map((currentMessage) => ({
              id: currentMessage.id,
              role: currentMessage.role,
              parts: currentMessage.parts,
              createdAt: new Date(),
              attachments: [],
              chatId: id,
            })),
          });
        }

        if (message?.role === "user") {
          const userText = extractTextParts(message.parts);
          const assistantText = [...finishedMessages]
            .reverse()
            .filter((currentMessage) => currentMessage.role === "assistant")
            .map((currentMessage) => extractTextParts(currentMessage.parts as Array<{ type?: string; text?: string }>))
            .find((text) => text.length > 0);

          if (userText && assistantText) {
            try {
              await trackAgentVocalTextTurn({
                chatId: id,
                userText,
                assistantText,
                userId: session.user.id,
                userName: displayName,
                metadata: {
                  source: "next-ai-sdk",
                  model: chatModel,
                  tool_approval_flow: isToolApprovalFlow,
                },
              });
            } catch (error) {
              console.error("Failed to track standard chat turn", error);
            }
          }
        }
      },
      onError: (error) => {
        if (
          error instanceof Error &&
          error.message?.includes(
            "AI Gateway requires a valid credit card on file to service requests"
          )
        ) {
          return "AI Gateway requires a valid credit card on file to service requests. Please visit https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%3Fmodal%3Dadd-credit-card to add a card and unlock your free credits.";
        }
        return "Oops, an error occurred!";
      },
    });

    return createUIMessageStreamResponse({
      stream,
      async consumeSseStream({ stream: sseStream }) {
        if (!process.env.REDIS_URL) {
          return;
        }
        try {
          const streamContext = getStreamContext();
          if (streamContext) {
            const streamId = generateId();
            await createStreamId({ streamId, chatId: id });
            await streamContext.createNewResumableStream(
              streamId,
              () => sseStream
            );
          }
        } catch (_) {
          /* non-critical */
        }
      },
    });
  } catch (error) {
    const vercelId = request.headers.get("x-vercel-id");

    if (error instanceof ChatbotError) {
      return error.toResponse();
    }

    if (
      error instanceof Error &&
      error.message?.includes(
        "AI Gateway requires a valid credit card on file to service requests"
      )
    ) {
      return new ChatbotError("bad_request:activate_gateway").toResponse();
    }

    console.error("Unhandled error in chat API:", error, { vercelId });
    return new ChatbotError("offline:chat").toResponse();
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new ChatbotError("bad_request:api").toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const chat = await getChatById({ id });

  if (chat?.userId !== session.user.id) {
    return new ChatbotError("forbidden:chat").toResponse();
  }

  const deletedChat = await deleteChatById({ id });

  return Response.json(deletedChat, { status: 200 });
}

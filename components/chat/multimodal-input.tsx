"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import equal from "fast-deep-equal";
import {
  ArrowUpIcon,
  BrainIcon,
  EyeIcon,
  LockIcon,
  MicIcon,
  SquareIcon,
  WrenchIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  type ChangeEvent,
  type Dispatch,
  memo,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { useLocalStorage, useWindowSize } from "usehooks-ts";
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";
import {
  type ChatModel,
  chatModels,
  DEFAULT_CHAT_MODEL,
  type ModelCapabilities,
} from "@/lib/ai/models";
import type { VoiceSample } from "@/lib/supabase/voices";
import type { Attachment, ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "../ai-elements/prompt-input";
import { Button } from "../ui/button";
import { PaperclipIcon, StopIcon } from "./icons";
import { PreviewAttachment } from "./preview-attachment";
import {
  type SlashCommand,
  SlashCommandMenu,
  slashCommands,
} from "./slash-commands";
import { SuggestedActions } from "./suggested-actions";
import type { VisibilityType } from "./visibility-selector";

function setCookie(name: string, value: string) {
  const maxAge = 60 * 60 * 24 * 365;
  // biome-ignore lint/suspicious/noDocumentCookie: needed for client-side cookie setting
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}`;
}

type VoiceWsSession = {
  wsUrl: string;
  expiresIn: number;
};

type VoiceWsEvent = {
  type: string;
  session_id?: string;
  turn_id?: number;
  text?: string;
  full_text?: string;
  index?: number;
  data?: string;
  message?: string;
};

type VoiceTurnState = {
  turnId: number | null;
  userMessageId: string | null;
  assistantMessageId: string | null;
  assistantText: string;
};

function base64ToAudioBlob(data: string, mimeType = "audio/wav") {
  const binary = atob(data);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
}

function getPreferredRecorderMimeType() {
  if (typeof MediaRecorder === "undefined") {
    return "audio/webm";
  }

  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
    return "audio/webm;codecs=opus";
  }

  if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) {
    return "audio/ogg;codecs=opus";
  }

  return "audio/webm";
}

function PureMultimodalInput({
  chatId,
  input,
  setInput,
  status,
  stop,
  attachments,
  setAttachments,
  messages,
  setMessages,
  sendMessage,
  className,
  selectedVisibilityType,
  selectedModelId,
  onModelChange,
  editingMessage,
  onCancelEdit,
  isLoading,
}: {
  chatId: string;
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  status: UseChatHelpers<ChatMessage>["status"];
  stop: () => void;
  attachments: Attachment[];
  setAttachments: Dispatch<SetStateAction<Attachment[]>>;
  messages: UIMessage[];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  sendMessage:
    | UseChatHelpers<ChatMessage>["sendMessage"]
    | (() => Promise<void>);
  className?: string;
  selectedVisibilityType: VisibilityType;
  selectedModelId: string;
  onModelChange?: (modelId: string) => void;
  editingMessage?: ChatMessage | null;
  onCancelEdit?: () => void;
  isLoading?: boolean;
}) {
  const router = useRouter();
  const { setTheme, resolvedTheme } = useTheme();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { width } = useWindowSize();
  const hasAutoFocused = useRef(false);
  useEffect(() => {
    if (!hasAutoFocused.current && width) {
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
        hasAutoFocused.current = true;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [width]);

  const [localStorageInput, setLocalStorageInput] = useLocalStorage(
    "input",
    ""
  );
  const [interactionMode, setInteractionMode] = useLocalStorage<
    "text" | "voice"
  >("interaction-mode", "text");

  useEffect(() => {
    if (textareaRef.current) {
      const domValue = textareaRef.current.value;
      const finalValue = domValue || localStorageInput || "";
      setInput(finalValue);
    }
  }, [localStorageInput, setInput]);

  useEffect(() => {
    setLocalStorageInput(input);
  }, [input, setLocalStorageInput]);

  const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = event.target.value;
    setInput(val);

    if (val.startsWith("/") && !val.includes(" ")) {
      setSlashOpen(true);
      setSlashQuery(val.slice(1));
      setSlashIndex(0);
    } else {
      setSlashOpen(false);
    }
  };

  const handleSlashSelect = (cmd: SlashCommand) => {
    setSlashOpen(false);
    setInput("");
    switch (cmd.action) {
      case "new":
        router.push("/");
        break;
      case "clear":
        setMessages(() => []);
        break;
      case "rename":
        toast("Rename is available from the sidebar chat menu.");
        break;
      case "model": {
        const modelBtn = document.querySelector<HTMLButtonElement>(
          "[data-testid='model-selector']"
        );
        modelBtn?.click();
        break;
      }
      case "theme":
        setTheme(resolvedTheme === "dark" ? "light" : "dark");
        break;
      case "delete":
        toast("Delete this chat?", {
          action: {
            label: "Delete",
            onClick: () => {
              fetch(
                `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/chat?id=${chatId}`,
                { method: "DELETE" }
              );
              router.push("/");
              toast.success("Chat deleted");
            },
          },
        });
        break;
      case "purge":
        toast("Delete all chats?", {
          action: {
            label: "Delete all",
            onClick: () => {
              fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/history`, {
                method: "DELETE",
              });
              router.push("/");
              toast.success("All chats deleted");
            },
          },
        });
        break;
      default:
        break;
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadQueue, setUploadQueue] = useState<string[]>([]);
  const [isVoiceLoading, setIsVoiceLoading] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [isVoiceSessionActive, setIsVoiceSessionActive] = useState(false);
  const [isAssistantSpeaking, setIsAssistantSpeaking] = useState(false);
  const { data: voices = [], isLoading: isVoicesLoading } = useSWR<VoiceSample[]>(
    interactionMode === "voice"
      ? `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/voices`
      : null,
    (url: string) => fetch(url).then((r) => r.json()),
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  );
  const [selectedVoiceId, setSelectedVoiceId] = useLocalStorage<string>(
    "selected-voice-id",
    "browser"
  );

  useEffect(() => {
    if (interactionMode !== "voice" || voices.length === 0) {
      return;
    }

    const selectedVoiceExists =
      selectedVoiceId === "browser" ||
      voices.some((voice) => voice.id === selectedVoiceId);
    if (!selectedVoiceExists) {
      setSelectedVoiceId(voices[0].id);
    }
  }, [interactionMode, selectedVoiceId, setSelectedVoiceId, voices]);

  const selectedVoice = voices.find((voice) => voice.id === selectedVoiceId);
  const requiresServerVoice = interactionMode === "voice" && selectedVoiceId !== "browser";
  const hasResolvedServerVoice = Boolean(
    selectedVoice?.url && selectedVoice?.id && selectedVoice?.reference_text
  );

  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeAudioUrlRef = useRef<string | null>(null);
  const isVoiceLoadingRef = useRef(false);
  const isRecordingVoiceRef = useRef(false);
  const isAssistantSpeakingRef = useRef(false);
  const assistantSpeechCooldownUntilRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const silenceTimeoutRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const hasDetectedSpeechRef = useRef(false);
  const cancelCurrentTurnRef = useRef(false);
  const recorderMimeTypeRef = useRef("audio/webm");
  const wsRef = useRef<WebSocket | null>(null);
  const wsReadyRef = useRef(false);
  const wsClosingRef = useRef(false);
  const voiceOutputModeRef = useRef<"browser" | "server">("browser");
  const voiceTurnStateRef = useRef<VoiceTurnState>({
    turnId: null,
    userMessageId: null,
    assistantMessageId: null,
    assistantText: "",
  });
  const serverAudioQueueRef = useRef<Array<{ index: number; url: string }>>([]);
  const isServerAudioPlayingRef = useRef(false);
  const browserSpeechQueueRef = useRef<string[]>([]);
  const isBrowserSpeechPlayingRef = useRef(false);

  useEffect(() => {
    isVoiceLoadingRef.current = isVoiceLoading;
  }, [isVoiceLoading]);

  useEffect(() => {
    isRecordingVoiceRef.current = isRecordingVoice;
  }, [isRecordingVoice]);

  useEffect(() => {
    isAssistantSpeakingRef.current = isAssistantSpeaking;
  }, [isAssistantSpeaking]);

  const submitForm = useCallback(() => {
    window.history.pushState(
      {},
      "",
      `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/chat/${chatId}`
    );

    sendMessage({
      role: "user",
      parts: [
        ...attachments.map((attachment) => ({
          type: "file" as const,
          url: attachment.url,
          name: attachment.name,
          mediaType: attachment.contentType,
        })),
        {
          type: "text",
          text: input,
        },
      ],
    });

    setAttachments([]);
    setLocalStorageInput("");
    setInput("");

    if (width && width > 768) {
      textareaRef.current?.focus();
    }
  }, [
    input,
    setInput,
    attachments,
    sendMessage,
    setAttachments,
    setLocalStorageInput,
    width,
    chatId,
  ]);

  const uploadFile = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/files/upload`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (response.ok) {
        const data = await response.json();
        const { url, pathname, contentType } = data;

        return {
          url,
          name: pathname,
          contentType,
        };
      }
      const { error } = await response.json();
      toast.error(error);
    } catch (_error) {
      toast.error("Failed to upload file, please try again!");
    }
  }, []);

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);

      setUploadQueue(files.map((file) => file.name));

      try {
        const uploadPromises = files.map((file) => uploadFile(file));
        const uploadedAttachments = await Promise.all(uploadPromises);
        const successfullyUploadedAttachments = uploadedAttachments.filter(
          (attachment) => attachment !== undefined
        );

        setAttachments((currentAttachments) => [
          ...currentAttachments,
          ...successfullyUploadedAttachments,
        ]);
      } catch (_error) {
        toast.error("Failed to upload files");
      } finally {
        setUploadQueue([]);
      }
    },
    [setAttachments, uploadFile]
  );

  const resetVoiceTurnState = useCallback((turnId: number | null = null) => {
    voiceTurnStateRef.current = {
      turnId,
      userMessageId: null,
      assistantMessageId: null,
      assistantText: "",
    };
  }, []);

  const upsertAssistantMessage = useCallback(
    (text: string) => {
      const currentState = voiceTurnStateRef.current;
      const assistantMessageId = currentState.assistantMessageId ?? crypto.randomUUID();

      voiceTurnStateRef.current = {
        ...currentState,
        assistantMessageId,
        assistantText: text,
      };

      setMessages((current) => {
        const exists = current.some((message) => message.id === assistantMessageId);
        if (!exists) {
          return [
            ...current,
            {
              id: assistantMessageId,
              role: "assistant",
              parts: [{ type: "text", text }],
            },
          ];
        }

        return current.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                role: "assistant",
                parts: [{ type: "text", text }],
              }
            : message
        );
      });
    },
    [setMessages]
  );

  const appendAssistantDelta = useCallback(
    (delta: string) => {
      if (!delta) {
        return;
      }
      const nextText = `${voiceTurnStateRef.current.assistantText}${delta}`;
      upsertAssistantMessage(nextText);
    },
    [upsertAssistantMessage]
  );

  const ensureUserTranscriptMessage = useCallback(
    (text: string) => {
      if (!text || voiceTurnStateRef.current.userMessageId) {
        return;
      }

      const userMessageId = crypto.randomUUID();
      voiceTurnStateRef.current = {
        ...voiceTurnStateRef.current,
        userMessageId,
      };

      setMessages((current) => [
        ...current,
        {
          id: userMessageId,
          role: "user",
          parts: [{ type: "text", text }],
        },
      ]);
    },
    [setMessages]
  );

  const playNextServerAudio = useCallback(() => {
    if (isServerAudioPlayingRef.current) {
      return;
    }

    const nextItem = serverAudioQueueRef.current.shift();
    if (!nextItem) {
      return;
    }

    const audio = new Audio(nextItem.url);
    activeAudioRef.current = audio;
    activeAudioUrlRef.current = nextItem.url;
    isServerAudioPlayingRef.current = true;

    const finalize = () => {
      if (activeAudioUrlRef.current) {
        URL.revokeObjectURL(activeAudioUrlRef.current);
        activeAudioUrlRef.current = null;
      }
      if (activeAudioRef.current === audio) {
        activeAudioRef.current = null;
      }
      isServerAudioPlayingRef.current = false;
      setIsAssistantSpeaking(false);
      playNextServerAudio();
    };

    audio.onplay = () => {
      assistantSpeechCooldownUntilRef.current = Date.now() + 1200;
      setIsAssistantSpeaking(true);
    };
    audio.onended = finalize;
    audio.onerror = finalize;
    audio.onpause = () => {
      if (audio.currentTime < audio.duration) {
        setIsAssistantSpeaking(false);
      }
    };
    void audio.play().catch(finalize);
  }, []);

  const enqueueServerAudioChunk = useCallback(
    (index: number, base64Audio: string) => {
      const audioBlob = base64ToAudioBlob(base64Audio);
      const audioUrl = URL.createObjectURL(audioBlob);
      serverAudioQueueRef.current.push({ index, url: audioUrl });
      serverAudioQueueRef.current.sort((left, right) => left.index - right.index);
      playNextServerAudio();
    },
    [playNextServerAudio]
  );

  const playNextBrowserSpeech = useCallback(() => {
    if (isBrowserSpeechPlayingRef.current) {
      return;
    }
    if (typeof window === "undefined" || !window.speechSynthesis) {
      return;
    }

    const nextSentence = browserSpeechQueueRef.current.shift();
    if (!nextSentence) {
      return;
    }

    isBrowserSpeechPlayingRef.current = true;
    const utterance = new SpeechSynthesisUtterance(nextSentence);
    utterance.lang = "fr-FR";
    utterance.rate = 1.0;
    utterance.onstart = () => {
      assistantSpeechCooldownUntilRef.current = Date.now() + 1200;
      setIsAssistantSpeaking(true);
    };
    utterance.onend = () => {
      isBrowserSpeechPlayingRef.current = false;
      setIsAssistantSpeaking(false);
      playNextBrowserSpeech();
    };
    utterance.onerror = () => {
      isBrowserSpeechPlayingRef.current = false;
      setIsAssistantSpeaking(false);
      playNextBrowserSpeech();
    };
    window.speechSynthesis.speak(utterance);
  }, []);

  const enqueueBrowserSpeechSentence = useCallback(
    (sentence: string) => {
      if (!sentence.trim()) {
        return;
      }
      browserSpeechQueueRef.current.push(sentence);
      playNextBrowserSpeech();
    },
    [playNextBrowserSpeech]
  );

  const stopVoiceOutput = useCallback(() => {
    activeAudioRef.current?.pause();
    if (activeAudioRef.current) {
      activeAudioRef.current.currentTime = 0;
      activeAudioRef.current = null;
    }
    if (activeAudioUrlRef.current) {
      URL.revokeObjectURL(activeAudioUrlRef.current);
      activeAudioUrlRef.current = null;
    }
    serverAudioQueueRef.current.forEach((item) => URL.revokeObjectURL(item.url));
    serverAudioQueueRef.current = [];
    browserSpeechQueueRef.current = [];
    isServerAudioPlayingRef.current = false;
    isBrowserSpeechPlayingRef.current = false;
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    assistantSpeechCooldownUntilRef.current = Date.now() + 1200;
    setIsAssistantSpeaking(false);
  }, []);

  const handleVoiceWsEvent = useCallback(
    (event: VoiceWsEvent) => {
      switch (event.type) {
        case "ready":
          if ((event.turn_id ?? 0) === 0) {
            wsReadyRef.current = true;
            return;
          }
          resetVoiceTurnState();
          isVoiceLoadingRef.current = false;
          setIsVoiceLoading(false);
          return;
        case "processing":
          resetVoiceTurnState(event.turn_id ?? null);
          isVoiceLoadingRef.current = true;
          setIsVoiceLoading(true);
          return;
        case "transcript":
          ensureUserTranscriptMessage(event.text ?? "");
          return;
        case "text_chunk":
          appendAssistantDelta(event.text ?? "");
          return;
        case "text_sentence":
          if (voiceOutputModeRef.current === "browser") {
            enqueueBrowserSpeechSentence(event.text ?? "");
          }
          return;
        case "audio_chunk":
          if (voiceOutputModeRef.current === "server" && event.data) {
            enqueueServerAudioChunk(event.index ?? 0, event.data);
          }
          return;
        case "done":
          if (event.full_text) {
            upsertAssistantMessage(event.full_text);
          }
          return;
        case "interrupted":
          isVoiceLoadingRef.current = false;
          setIsVoiceLoading(false);
          return;
        case "error":
          isVoiceLoadingRef.current = false;
          setIsVoiceLoading(false);
          if (voiceOutputModeRef.current === "server" && (event.message || "").startsWith("TTS")) {
            stopVoiceOutput();
            voiceOutputModeRef.current = "browser";
            toast.error(
              event.message ||
                "La synthèse vocale serveur a échoué. Bascule navigateur."
            );
            return;
          }
          toast.error(event.message || "La session vocale a rencontré une erreur.");
          return;
        default:
          return;
      }
    },
    [
      appendAssistantDelta,
      enqueueBrowserSpeechSentence,
      enqueueServerAudioChunk,
      ensureUserTranscriptMessage,
      resetVoiceTurnState,
      stopVoiceOutput,
      upsertAssistantMessage,
    ]
  );

  const closeVoiceSocket = useCallback(() => {
    wsReadyRef.current = false;
    if (wsRef.current) {
      wsClosingRef.current = true;
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const openVoiceSocket = useCallback(
    async (selectedVoice: VoiceSample | undefined, audioFormat: string) => {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/chat/voice/session`,
        {
          method: "POST",
        }
      );
      if (!response.ok) {
        throw new Error("Initialisation de la session vocale impossible.");
      }

      const session = (await response.json()) as VoiceWsSession;
      if (!session.wsUrl) {
        throw new Error("URL WebSocket manquante.");
      }

      voiceOutputModeRef.current = selectedVoiceId === "browser" ? "browser" : "server";

      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(session.wsUrl);
        let settled = false;
        const timeout = window.setTimeout(() => {
          if (!settled) {
            settled = true;
            ws.close();
            reject(new Error("Timeout d'initialisation de la session vocale."));
          }
        }, 15000);

        ws.onopen = () => {
          ws.send(
            JSON.stringify({
              type: "init",
              session_id: chatId,
              user_name: "Web User",
              channel: "web",
              audio_format: audioFormat,
              voice_mode: selectedVoiceId === "browser" ? "browser" : "sample",
              voice_url: selectedVoice?.url,
              voice_id: selectedVoice?.id,
              voice_reference_text: selectedVoice?.reference_text ?? "",
            })
          );
        };

        ws.onmessage = (message) => {
          try {
            const event = JSON.parse(String(message.data)) as VoiceWsEvent;
            handleVoiceWsEvent(event);
            if (!settled && event.type === "ready" && (event.turn_id ?? 0) === 0) {
              settled = true;
              wsRef.current = ws;
              wsReadyRef.current = true;
              window.clearTimeout(timeout);
              resolve();
            }
          } catch (error) {
            if (!settled) {
              settled = true;
              window.clearTimeout(timeout);
              reject(error);
            }
          }
        };

        ws.onerror = () => {
          if (!settled) {
            settled = true;
            window.clearTimeout(timeout);
            reject(new Error("Erreur WebSocket"));
          }
        };

        ws.onclose = () => {
          window.clearTimeout(timeout);
          wsReadyRef.current = false;
          wsRef.current = null;
          if (wsClosingRef.current) {
            wsClosingRef.current = false;
            return;
          }
          if (!settled) {
            settled = true;
            reject(new Error("Session WebSocket fermée"));
            return;
          }

          toast.error("La session vocale a été interrompue.");
          isVoiceLoadingRef.current = false;
          isRecordingVoiceRef.current = false;
          setIsVoiceLoading(false);
          setIsRecordingVoice(false);
          setIsVoiceSessionActive(false);
          mediaRecorderRef.current = null;
          mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
          mediaStreamRef.current = null;
          if (silenceTimeoutRef.current) {
            window.clearTimeout(silenceTimeoutRef.current);
            silenceTimeoutRef.current = null;
          }
          if (animationFrameRef.current) {
            window.cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
          }
          if (audioContextRef.current) {
            void audioContextRef.current.close();
            audioContextRef.current = null;
          }
          stopVoiceOutput();
          resetVoiceTurnState();
        };
      });
    },
    [chatId, handleVoiceWsEvent, resetVoiceTurnState, selectedVoiceId, stopVoiceOutput]
  );

  const sendVoiceBlob = useCallback(
    async (blob: Blob) => {
      setIsVoiceLoading(true);
      isVoiceLoadingRef.current = true;
      setIsAssistantSpeaking(false);

      try {
        window.history.pushState(
          {},
          "",
          `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/chat/${chatId}`
        );

        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN || !wsReadyRef.current) {
          throw new Error("La session vocale n'est pas prête.");
        }

        const payload = await blob.arrayBuffer();
        ws.send(payload);
        ws.send(JSON.stringify({ type: "commit" }));
      } catch (error) {
        isVoiceLoadingRef.current = false;
        setIsVoiceLoading(false);
        toast.error(error instanceof Error ? error.message : "Impossible de traiter le message vocal.");
      }
    },
    [chatId]
  );

  const stopTurnRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    isRecordingVoiceRef.current = false;
    setIsRecordingVoice(false);
  }, []);

  const stopVoiceSession = useCallback(() => {
    if (silenceTimeoutRef.current) {
      window.clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    if (animationFrameRef.current) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (mediaRecorderRef.current?.state === "recording") {
      cancelCurrentTurnRef.current = true;
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    closeVoiceSocket();
    stopVoiceOutput();
    resetVoiceTurnState();
    isRecordingVoiceRef.current = false;
    isVoiceLoadingRef.current = false;
    setIsRecordingVoice(false);
    setIsVoiceLoading(false);
    setIsVoiceSessionActive(false);
    hasDetectedSpeechRef.current = false;
  }, [closeVoiceSocket, resetVoiceTurnState, stopVoiceOutput]);

  const startTurnRecording = useCallback(() => {
    const stream = mediaStreamRef.current;
    if (
      !stream ||
      mediaRecorderRef.current?.state === "recording" ||
      isVoiceLoadingRef.current
    ) {
      return;
    }

    voiceChunksRef.current = [];
    const recorder = new MediaRecorder(stream, {
      mimeType: recorderMimeTypeRef.current,
    });
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        voiceChunksRef.current.push(event.data);
      }
    };

    recorder.onerror = () => {
      toast.error("L'enregistrement micro a echoue.");
      isRecordingVoiceRef.current = false;
      setIsRecordingVoice(false);
    };

    recorder.onstop = async () => {
      if (cancelCurrentTurnRef.current) {
        cancelCurrentTurnRef.current = false;
        voiceChunksRef.current = [];
        mediaRecorderRef.current = null;
        isRecordingVoiceRef.current = false;
        return;
      }

      const blob = new Blob(voiceChunksRef.current, {
        type: recorder.mimeType,
      });
      voiceChunksRef.current = [];
      mediaRecorderRef.current = null;
      isRecordingVoiceRef.current = false;

      if (blob.size === 0) {
        return;
      }

      await sendVoiceBlob(blob);
    };

    recorder.start();
    isRecordingVoiceRef.current = true;
    setIsRecordingVoice(true);
  }, [sendVoiceBlob]);

  const startVoiceSession = useCallback(async () => {
    if (mediaStreamRef.current) {
      return;
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      toast.error("Le micro n'est pas disponible sur ce navigateur.");
      return;
    }

    try {
      if (requiresServerVoice && !selectedVoice) {
        throw new Error("La voix sélectionnée n'est pas encore chargée.");
      }

      const recorderMimeType = getPreferredRecorderMimeType();
      recorderMimeTypeRef.current = recorderMimeType;
      await openVoiceSocket(selectedVoice, recorderMimeType);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;
      hasDetectedSpeechRef.current = false;
      setIsVoiceSessionActive(true);

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.fftSize);

      const monitorSilence = () => {
        if (
          isAssistantSpeakingRef.current ||
          Date.now() < assistantSpeechCooldownUntilRef.current
        ) {
          if (silenceTimeoutRef.current) {
            window.clearTimeout(silenceTimeoutRef.current);
            silenceTimeoutRef.current = null;
          }
          if (mediaStreamRef.current) {
            animationFrameRef.current =
              window.requestAnimationFrame(monitorSilence);
          }
          return;
        }

        analyser.getByteTimeDomainData(dataArray);

        let sum = 0;
        for (const value of dataArray) {
          const normalized = (value - 128) / 128;
          sum += normalized * normalized;
        }

        const rms = Math.sqrt(sum / dataArray.length);
        const isSpeaking = rms > 0.035;

        if (isSpeaking) {
          hasDetectedSpeechRef.current = true;

          if (silenceTimeoutRef.current) {
            window.clearTimeout(silenceTimeoutRef.current);
            silenceTimeoutRef.current = null;
          }

          if (!isRecordingVoiceRef.current && !isVoiceLoadingRef.current) {
            startTurnRecording();
          }
        } else if (isRecordingVoiceRef.current && !silenceTimeoutRef.current) {
          silenceTimeoutRef.current = window.setTimeout(() => {
            silenceTimeoutRef.current = null;
            stopTurnRecording();
          }, 1200);
        }

        if (mediaStreamRef.current) {
          animationFrameRef.current =
            window.requestAnimationFrame(monitorSilence);
        }
      };

      animationFrameRef.current = window.requestAnimationFrame(monitorSilence);
    } catch (error) {
      closeVoiceSocket();
      toast.error(
        error instanceof Error
          ? error.message
          : "Autorisation micro refusee ou indisponible."
      );
    }
  }, [
    closeVoiceSocket,
    openVoiceSocket,
    requiresServerVoice,
    selectedVoice,
    selectedVoiceId,
    startTurnRecording,
    stopTurnRecording,
    stopVoiceOutput,
  ]);

  useEffect(() => {
    return () => {
      stopVoiceSession();
    };
  }, [stopVoiceSession]);

  const voiceStatusLabel = isVoiceLoading
    ? "Analyse et reponse en cours..."
    : isVoicesLoading
      ? "Chargement des voix..."
      : requiresServerVoice && !hasResolvedServerVoice
        ? "La voix clonée sélectionnée n'est pas encore prête."
    : isAssistantSpeaking
      ? "Je parle. Si tu reparles, je m'arrete et je t'ecoute."
      : isRecordingVoice
        ? "Je t'ecoute. Des que tu t'arretes, j'envoie automatiquement."
        : isVoiceSessionActive
          ? "Session vocale active. Parle librement quand tu veux."
          : "Clique une fois, puis parle librement avec l'assistant.";

  const voiceStatusShort = isVoiceLoading
    ? "Thinking"
    : isVoicesLoading
      ? "Loading"
      : requiresServerVoice && !hasResolvedServerVoice
        ? "Voice"
    : isAssistantSpeaking
      ? "Speaking"
      : isRecordingVoice
        ? "Listening"
        : isVoiceSessionActive
          ? "Open"
          : "Ready";

  const handlePaste = useCallback(
    async (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) {
        return;
      }

      const imageItems = Array.from(items).filter((item) =>
        item.type.startsWith("image/")
      );

      if (imageItems.length === 0) {
        return;
      }

      event.preventDefault();

      setUploadQueue((prev) => [...prev, "Pasted image"]);

      try {
        const uploadPromises = imageItems
          .map((item) => item.getAsFile())
          .filter((file): file is File => file !== null)
          .map((file) => uploadFile(file));

        const uploadedAttachments = await Promise.all(uploadPromises);
        const successfullyUploadedAttachments = uploadedAttachments.filter(
          (attachment) =>
            attachment !== undefined &&
            attachment.url !== undefined &&
            attachment.contentType !== undefined
        );

        setAttachments((curr) => [
          ...curr,
          ...(successfullyUploadedAttachments as Attachment[]),
        ]);
      } catch (_error) {
        toast.error("Failed to upload pasted image(s)");
      } finally {
        setUploadQueue([]);
      }
    },
    [setAttachments, uploadFile]
  );

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.addEventListener("paste", handlePaste);
    return () => textarea.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  return (
    <div className={cn("relative flex w-full flex-col gap-4", className)}>
      {editingMessage && onCancelEdit && (
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <span>Editing message</span>
          <button
            className="rounded px-1.5 py-0.5 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
            onMouseDown={(e) => {
              e.preventDefault();
              onCancelEdit();
            }}
            type="button"
          >
            Cancel
          </button>
        </div>
      )}

      {!editingMessage &&
        !isLoading &&
        messages.length === 0 &&
        attachments.length === 0 &&
        uploadQueue.length === 0 && (
          <SuggestedActions
            chatId={chatId}
            selectedVisibilityType={selectedVisibilityType}
            sendMessage={sendMessage}
          />
        )}

      <input
        className="pointer-events-none fixed -top-4 -left-4 size-0.5 opacity-0"
        multiple
        onChange={handleFileChange}
        ref={fileInputRef}
        tabIndex={-1}
        type="file"
      />
      <div className="relative">
        {slashOpen && (
          <SlashCommandMenu
            onClose={() => setSlashOpen(false)}
            onSelect={handleSlashSelect}
            query={slashQuery}
            selectedIndex={slashIndex}
          />
        )}
      </div>

      <div className="flex items-center justify-center gap-2">
        <Button
          className={cn(
            "rounded-full px-4",
            interactionMode === "text" &&
              "bg-foreground text-background hover:bg-foreground/90"
          )}
          onClick={() => setInteractionMode("text")}
          type="button"
          variant={interactionMode === "text" ? "secondary" : "ghost"}
        >
          Texte
        </Button>
        <Button
          className={cn(
            "rounded-full px-4",
            interactionMode === "voice" &&
              "bg-foreground text-background hover:bg-foreground/90"
          )}
          onClick={() => setInteractionMode("voice")}
          type="button"
          variant={interactionMode === "voice" ? "secondary" : "ghost"}
        >
          Vocal
        </Button>
      </div>

      {interactionMode === "text" ? (
        <PromptInput
          className="[&>div]:rounded-2xl [&>div]:border [&>div]:border-border/30 [&>div]:bg-card/70 [&>div]:shadow-(--shadow-composer) [&>div]:transition-shadow [&>div]:duration-300 [&>div]:focus-within:shadow-(--shadow-composer-focus)"
          onSubmit={() => {
            if (input.startsWith("/")) {
              const query = input.slice(1).trim();
              const cmd = slashCommands.find((c) => c.name === query);
              if (cmd) {
                handleSlashSelect(cmd);
              }
              return;
            }
            if (!input.trim() && attachments.length === 0) {
              return;
            }
            if (status === "ready" || status === "error") {
              submitForm();
            } else {
              toast.error("Please wait for the model to finish its response!");
            }
          }}
        >
          {(attachments.length > 0 || uploadQueue.length > 0) && (
            <div
              className="flex w-full self-start flex-row gap-2 overflow-x-auto px-3 pt-3 no-scrollbar"
              data-testid="attachments-preview"
            >
              {attachments.map((attachment) => (
                <PreviewAttachment
                  attachment={attachment}
                  key={attachment.url}
                  onRemove={() => {
                    setAttachments((currentAttachments) =>
                      currentAttachments.filter((a) => a.url !== attachment.url)
                    );
                    if (fileInputRef.current) {
                      fileInputRef.current.value = "";
                    }
                  }}
                />
              ))}

              {uploadQueue.map((filename) => (
                <PreviewAttachment
                  attachment={{
                    url: "",
                    name: filename,
                    contentType: "",
                  }}
                  isUploading={true}
                  key={filename}
                />
              ))}
            </div>
          )}
          <PromptInputTextarea
            className="min-h-24 text-[13px] leading-relaxed px-4 pt-3.5 pb-1.5 placeholder:text-muted-foreground/35"
            data-testid="multimodal-input"
            onChange={handleInput}
            onKeyDown={(e) => {
              if (slashOpen) {
                const filtered = slashCommands.filter((cmd) =>
                  cmd.name.startsWith(slashQuery.toLowerCase())
                );
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setSlashIndex((i) => Math.min(i + 1, filtered.length - 1));
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setSlashIndex((i) => Math.max(i - 1, 0));
                  return;
                }
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  if (filtered[slashIndex]) {
                    handleSlashSelect(filtered[slashIndex]);
                  }
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setSlashOpen(false);
                  return;
                }
              }
              if (e.key === "Escape" && editingMessage && onCancelEdit) {
                e.preventDefault();
                onCancelEdit();
              }
            }}
            placeholder={
              editingMessage ? "Edit your message..." : "Ask anything..."
            }
            ref={textareaRef}
            value={input}
          />
          <PromptInputFooter className="px-3 pb-3">
            <PromptInputTools>
              <AttachmentsButton
                fileInputRef={fileInputRef}
                selectedModelId={selectedModelId}
                status={status}
              />
              <Button
                className="h-7 w-7 rounded-lg border border-border/40 p-1"
                onClick={(event) => {
                  event.preventDefault();
                  setInteractionMode("voice");
                }}
                title="Passer au mode vocal"
                type="button"
                variant="ghost"
              >
                <MicIcon className="size-3.5" />
              </Button>
              <ModelSelectorCompact
                onModelChange={onModelChange}
                selectedModelId={selectedModelId}
              />
            </PromptInputTools>

            {status === "submitted" ? (
              <StopButton setMessages={setMessages} stop={stop} />
            ) : (
              <PromptInputSubmit
                className={cn(
                  "h-7 w-7 rounded-xl transition-all duration-200",
                  input.trim()
                    ? "bg-foreground text-background hover:opacity-85 active:scale-95"
                    : "bg-muted text-muted-foreground/25 cursor-not-allowed"
                )}
                data-testid="send-button"
                disabled={!input.trim() || uploadQueue.length > 0}
                status={status}
                variant="secondary"
              >
                <ArrowUpIcon className="size-4" />
              </PromptInputSubmit>
            )}
          </PromptInputFooter>
        </PromptInput>
      ) : (
        <div className="overflow-hidden rounded-[28px] border border-white/6 bg-linear-to-b from-zinc-950 via-[#0f0f0f] to-zinc-950 px-5 py-6 shadow-(--shadow-composer) md:px-8 md:py-8">
          <div className="flex min-h-[460px] flex-col items-center justify-between md:min-h-[540px]">

            {/* Header */}
            <div className="flex w-full items-center justify-between gap-2">
              <span className="text-[10px] font-semibold tracking-[0.18em] text-white/20 uppercase shrink-0">
                Agent Vocal
              </span>
              <div className="flex items-center gap-2 min-w-0">
                {voices.length > 0 && (
                  <select
                    className="h-6 max-w-[130px] truncate rounded-lg border border-white/10 bg-white/5 px-2 text-[10px] text-white/50 outline-none hover:bg-white/8 focus:border-white/20"
                    onChange={(e) => setSelectedVoiceId(e.target.value)}
                    value={selectedVoiceId}
                  >
                    <option value="browser">Navigateur (TTS)</option>
                    {voices.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                )}
                <div
                  className={cn(
                    "size-1.5 rounded-full transition-all duration-500 shrink-0",
                    isVoiceSessionActive
                      ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]"
                      : "bg-white/15"
                  )}
                />
                <span className="text-[10px] font-medium tracking-wide text-white/25 shrink-0">
                  {voiceStatusShort}
                </span>
              </div>
            </div>

            {/* Mic button zone */}
            <div className="relative flex flex-1 items-center justify-center py-6">
              {/* Pulsing rings — recording */}
              {isRecordingVoice && (
                <>
                  <div
                    className="absolute size-[190px] md:size-[230px] rounded-full border border-white/10 animate-ping"
                    style={{ animationDuration: "1.4s" }}
                  />
                  <div
                    className="absolute size-[230px] md:size-[275px] rounded-full border border-white/5 animate-ping"
                    style={{ animationDuration: "1.9s", animationDelay: "0.25s" }}
                  />
                </>
              )}
              {/* Soft glow rings — speaking */}
              {isAssistantSpeaking && (
                <>
                  <div
                    className="absolute size-[190px] md:size-[230px] rounded-full border border-white/7 animate-ping"
                    style={{ animationDuration: "1.8s" }}
                  />
                  <div
                    className="absolute size-[225px] md:size-[265px] rounded-full border border-white/4 animate-ping"
                    style={{ animationDuration: "2.4s", animationDelay: "0.4s" }}
                  />
                </>
              )}

              <button
                className={cn(
                  "relative z-10 flex size-[150px] md:size-[180px] flex-col items-center justify-center gap-2.5 rounded-full transition-all duration-500",
                  !isVoiceSessionActive &&
                    "bg-white hover:bg-white/95 cursor-pointer active:scale-95 shadow-[0_8px_40px_rgba(255,255,255,0.12)]",
                  isRecordingVoice &&
                    "bg-white shadow-[0_0_50px_rgba(255,255,255,0.18)]",
                  isVoiceLoading &&
                    "bg-white/6 border border-white/10 cursor-default",
                  isAssistantSpeaking &&
                    "bg-white/6 border border-white/10 cursor-default",
                  isVoiceSessionActive &&
                    !isRecordingVoice &&
                    !isVoiceLoading &&
                    !isAssistantSpeaking &&
                    "bg-white/6 border border-white/10 cursor-default"
                )}
                disabled={
                  isVoiceSessionActive ||
                  isVoicesLoading ||
                  (requiresServerVoice && !hasResolvedServerVoice)
                }
                onClick={() => {
                  if (!isVoiceSessionActive) {
                    void startVoiceSession();
                  }
                }}
                type="button"
              >
                {isRecordingVoice ? (
                  <>
                    <div className="flex items-end gap-[3px]" style={{ height: 28 }}>
                      {[14, 22, 28, 20, 12].map((h, i) => (
                        <div
                          key={i}
                          className="w-[3px] rounded-full bg-black animate-bounce"
                          style={{
                            height: h,
                            animationDelay: `${i * 90}ms`,
                            animationDuration: "550ms",
                          }}
                        />
                      ))}
                    </div>
                    <span className="text-[9px] font-semibold tracking-[0.15em] text-black/40 uppercase">
                      Écoute
                    </span>
                  </>
                ) : isVoiceLoading ? (
                  <>
                    <div className="size-7 rounded-full border-2 border-white/15 border-t-white/50 animate-spin" />
                    <span className="text-[9px] font-semibold tracking-[0.15em] text-white/30 uppercase">
                      Analyse
                    </span>
                  </>
                ) : isAssistantSpeaking ? (
                  <>
                    <div className="flex items-end gap-[3px]" style={{ height: 28 }}>
                      {[10, 24, 16, 28, 18].map((h, i) => (
                        <div
                          key={i}
                          className="w-[3px] rounded-full bg-white/50 animate-bounce"
                          style={{
                            height: h,
                            animationDelay: `${i * 110}ms`,
                            animationDuration: "680ms",
                          }}
                        />
                      ))}
                    </div>
                    <span className="text-[9px] font-semibold tracking-[0.15em] text-white/30 uppercase">
                      Parle
                    </span>
                  </>
                ) : isVoiceSessionActive ? (
                  <>
                    <MicIcon className="size-7 text-white/30" />
                    <span className="text-[9px] font-semibold tracking-[0.15em] text-white/20 uppercase">
                      En attente
                    </span>
                  </>
                ) : (
                  <>
                    <MicIcon className="size-9 text-black" />
                    <span className="text-[9px] font-semibold tracking-[0.15em] text-black/40 uppercase">
                      Démarrer
                    </span>
                  </>
                )}
              </button>
            </div>

            {/* Status label */}
            <p className="max-w-60 pb-5 text-center text-[11px] leading-relaxed text-white/25">
              {voiceStatusLabel}
            </p>

            {/* Bottom controls */}
            <div className="grid w-full grid-cols-3 items-center gap-3">
              <div className="flex justify-start">
                <Button
                  className="h-8 rounded-full border border-white/10 bg-transparent px-4 text-[12px] text-white/40 hover:bg-white/5 hover:text-white/70 transition-colors"
                  onClick={() => setInteractionMode("text")}
                  type="button"
                  variant="ghost"
                >
                  Texte
                </Button>
              </div>

              <div className="flex justify-center">
                <button
                  className="flex size-12 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/40 transition-all duration-200 hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
                  onClick={() => stopVoiceSession()}
                  type="button"
                >
                  <SquareIcon className="size-3.5 fill-current" />
                </button>
              </div>

              <div className="flex justify-end">
                <ModelSelectorCompact
                  onModelChange={onModelChange}
                  selectedModelId={selectedModelId}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const MultimodalInput = memo(
  PureMultimodalInput,
  (prevProps, nextProps) => {
    if (prevProps.input !== nextProps.input) {
      return false;
    }
    if (prevProps.status !== nextProps.status) {
      return false;
    }
    if (!equal(prevProps.attachments, nextProps.attachments)) {
      return false;
    }
    if (prevProps.selectedVisibilityType !== nextProps.selectedVisibilityType) {
      return false;
    }
    if (prevProps.selectedModelId !== nextProps.selectedModelId) {
      return false;
    }
    if (prevProps.editingMessage !== nextProps.editingMessage) {
      return false;
    }
    if (prevProps.isLoading !== nextProps.isLoading) {
      return false;
    }
    if (prevProps.messages.length !== nextProps.messages.length) {
      return false;
    }

    return true;
  }
);

function PureAttachmentsButton({
  fileInputRef,
  status,
  selectedModelId,
}: {
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  status: UseChatHelpers<ChatMessage>["status"];
  selectedModelId: string;
}) {
  const { data: modelsResponse } = useSWR(
    `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/models`,
    (url: string) => fetch(url).then((r) => r.json()),
    { revalidateOnFocus: false, dedupingInterval: 3_600_000 }
  );

  const caps: Record<string, ModelCapabilities> | undefined =
    modelsResponse?.capabilities ?? modelsResponse;
  const hasVision = caps?.[selectedModelId]?.vision ?? false;

  return (
    <Button
      className={cn(
        "h-7 w-7 rounded-lg border border-border/40 p-1 transition-colors",
        hasVision
          ? "text-foreground hover:border-border hover:text-foreground"
          : "text-muted-foreground/30 cursor-not-allowed"
      )}
      data-testid="attachments-button"
      disabled={status !== "ready" || !hasVision}
      onClick={(event) => {
        event.preventDefault();
        fileInputRef.current?.click();
      }}
      variant="ghost"
    >
      <PaperclipIcon size={14} style={{ width: 14, height: 14 }} />
    </Button>
  );
}

const AttachmentsButton = memo(PureAttachmentsButton);

function PureModelSelectorCompact({
  selectedModelId,
  onModelChange,
}: {
  selectedModelId: string;
  onModelChange?: (modelId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data: modelsData } = useSWR(
    `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/models`,
    (url: string) => fetch(url).then((r) => r.json()),
    { revalidateOnFocus: false, dedupingInterval: 3_600_000 }
  );

  const capabilities: Record<string, ModelCapabilities> | undefined =
    modelsData?.capabilities ?? modelsData;
  const dynamicModels: ChatModel[] | undefined = modelsData?.models;
  const activeModels = dynamicModels ?? chatModels;

  const selectedModel =
    activeModels.find((m: ChatModel) => m.id === selectedModelId) ??
    activeModels.find((m: ChatModel) => m.id === DEFAULT_CHAT_MODEL) ??
    activeModels[0];
  const [provider] = selectedModel.id.split("/");

  return (
    <ModelSelector onOpenChange={setOpen} open={open}>
      <ModelSelectorTrigger asChild>
        <Button
          className="h-7 max-w-[200px] justify-between gap-1.5 rounded-lg px-2 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
          data-testid="model-selector"
          variant="ghost"
        >
          {provider && <ModelSelectorLogo provider={provider} />}
          <ModelSelectorName>{selectedModel.name}</ModelSelectorName>
        </Button>
      </ModelSelectorTrigger>
      <ModelSelectorContent>
        <ModelSelectorInput placeholder="Search models..." />
        <ModelSelectorList>
          {(() => {
            const curatedIds = new Set(chatModels.map((m) => m.id));
            const allModels = dynamicModels
              ? [
                  ...chatModels,
                  ...dynamicModels.filter((m) => !curatedIds.has(m.id)),
                ]
              : chatModels;

            const grouped: Record<
              string,
              { model: ChatModel; curated: boolean }[]
            > = {};
            for (const model of allModels) {
              const key = curatedIds.has(model.id)
                ? "_available"
                : model.provider;
              if (!grouped[key]) {
                grouped[key] = [];
              }
              grouped[key].push({ model, curated: curatedIds.has(model.id) });
            }

            const sortedKeys = Object.keys(grouped).sort((a, b) => {
              if (a === "_available") {
                return -1;
              }
              if (b === "_available") {
                return 1;
              }
              return a.localeCompare(b);
            });

            const providerNames: Record<string, string> = {
              alibaba: "Alibaba",
              anthropic: "Anthropic",
              "arcee-ai": "Arcee AI",
              bytedance: "ByteDance",
              cohere: "Cohere",
              deepseek: "DeepSeek",
              google: "Google",
              inception: "Inception",
              kwaipilot: "Kwaipilot",
              meituan: "Meituan",
              meta: "Meta",
              minimax: "MiniMax",
              mistral: "Mistral",
              moonshotai: "Moonshot",
              morph: "Morph",
              nvidia: "Nvidia",
              openai: "OpenAI",
              perplexity: "Perplexity",
              "prime-intellect": "Prime Intellect",
              xiaomi: "Xiaomi",
              xai: "xAI",
              zai: "Zai",
            };

            return sortedKeys.map((key) => (
              <ModelSelectorGroup
                heading={
                  key === "_available"
                    ? "Available"
                    : (providerNames[key] ?? key)
                }
                key={key}
              >
                {grouped[key].map(({ model, curated }) => {
                  const logoProvider = model.id.split("/")[0];
                  return (
                    <ModelSelectorItem
                      className={cn(
                        "flex w-full",
                        model.id === selectedModel.id &&
                          "border-b border-dashed border-foreground/50",
                        !curated && "opacity-40 cursor-default"
                      )}
                      key={model.id}
                      onSelect={() => {
                        if (!curated) {
                          return;
                        }
                        onModelChange?.(model.id);
                        setCookie("chat-model", model.id);
                        setOpen(false);
                        setTimeout(() => {
                          document
                            .querySelector<HTMLTextAreaElement>(
                              "[data-testid='multimodal-input']"
                            )
                            ?.focus();
                        }, 50);
                      }}
                      value={model.id}
                    >
                      <ModelSelectorLogo provider={logoProvider} />
                      <ModelSelectorName>{model.name}</ModelSelectorName>
                      <div className="ml-auto flex items-center gap-2 text-foreground/70">
                        {capabilities?.[model.id]?.tools && (
                          <WrenchIcon className="size-3.5" />
                        )}
                        {capabilities?.[model.id]?.vision && (
                          <EyeIcon className="size-3.5" />
                        )}
                        {capabilities?.[model.id]?.reasoning && (
                          <BrainIcon className="size-3.5" />
                        )}
                        {!curated && (
                          <LockIcon className="size-3 text-muted-foreground/50" />
                        )}
                      </div>
                    </ModelSelectorItem>
                  );
                })}
              </ModelSelectorGroup>
            ));
          })()}
        </ModelSelectorList>
      </ModelSelectorContent>
    </ModelSelector>
  );
}

const ModelSelectorCompact = memo(PureModelSelectorCompact);

function PureStopButton({
  stop,
  setMessages,
}: {
  stop: () => void;
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
}) {
  return (
    <Button
      className="h-7 w-7 rounded-xl bg-foreground p-1 text-background transition-all duration-200 hover:opacity-85 active:scale-95 disabled:bg-muted disabled:text-muted-foreground/25 disabled:cursor-not-allowed"
      data-testid="stop-button"
      onClick={(event) => {
        event.preventDefault();
        stop();
        setMessages((messages) => messages);
      }}
    >
      <StopIcon size={14} />
    </Button>
  );
}

const StopButton = memo(PureStopButton);

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
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const isVoiceLoadingRef = useRef(false);
  const isRecordingVoiceRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const silenceTimeoutRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const hasDetectedSpeechRef = useRef(false);
  const cancelCurrentTurnRef = useRef(false);

  useEffect(() => {
    isVoiceLoadingRef.current = isVoiceLoading;
  }, [isVoiceLoading]);

  useEffect(() => {
    isRecordingVoiceRef.current = isRecordingVoice;
  }, [isRecordingVoice]);

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

        const extension = blob.type.includes("ogg")
          ? "ogg"
          : blob.type.includes("mp4")
            ? "m4a"
            : "webm";

        const audioFile = new File([blob], `voice-message.${extension}`, {
          type: blob.type || "audio/webm",
        });

        const formData = new FormData();
        formData.append("audio", audioFile);
        formData.append("session_id", chatId);
        formData.append("channel", "web");
        formData.append("user_name", "Web User");

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/chat/voice`,
          {
            method: "POST",
            body: formData,
          }
        );

        if (!response.ok) {
          toast.error("La requete vocale a echoue.");
          return;
        }

        const transcription = response.headers.get("X-Transcription");
        const assistantTextHeader = response.headers.get("X-Assistant-Text");
        const assistantText = assistantTextHeader
          ? decodeURIComponent(assistantTextHeader)
          : "";

        if (transcription) {
          setMessages((current) => [
            ...current,
            {
              id: crypto.randomUUID(),
              role: "user",
              parts: [{ type: "text", text: transcription }],
            },
            ...(assistantText
              ? [
                  {
                    id: crypto.randomUUID(),
                    role: "assistant" as const,
                    parts: [{ type: "text" as const, text: assistantText }],
                  },
                ]
              : []),
          ]);
        }

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        activeAudioRef.current?.pause();
        activeAudioRef.current = new Audio(audioUrl);
        const audio = activeAudioRef.current;
        audio.onplay = () => setIsAssistantSpeaking(true);
        audio.onended = () => setIsAssistantSpeaking(false);
        audio.onpause = () => setIsAssistantSpeaking(false);
        void audio.play();
      } catch (_error) {
        toast.error("Impossible de traiter le message vocal.");
      } finally {
        isVoiceLoadingRef.current = false;
        setIsVoiceLoading(false);
      }
    },
    [chatId, setMessages]
  );

  const stopVoiceOutput = useCallback(() => {
    activeAudioRef.current?.pause();
    if (activeAudioRef.current) {
      activeAudioRef.current.currentTime = 0;
    }
    setIsAssistantSpeaking(false);
  }, []);

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
    stopVoiceOutput();
    isRecordingVoiceRef.current = false;
    isVoiceLoadingRef.current = false;
    setIsRecordingVoice(false);
    setIsVoiceLoading(false);
    setIsVoiceSessionActive(false);
    hasDetectedSpeechRef.current = false;
  }, [stopVoiceOutput]);

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

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
        ? "audio/ogg;codecs=opus"
        : "audio/webm";

    const recorder = new MediaRecorder(stream, { mimeType });
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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

          if (activeAudioRef.current && !activeAudioRef.current.paused) {
            stopVoiceOutput();
          }

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
    } catch (_error) {
      toast.error("Autorisation micro refusee ou indisponible.");
    }
  }, [startTurnRecording, stopTurnRecording, stopVoiceOutput]);

  useEffect(() => {
    return () => {
      stopVoiceSession();
    };
  }, [stopVoiceSession]);

  const voiceStatusLabel = isVoiceLoading
    ? "Analyse et reponse en cours..."
    : isAssistantSpeaking
      ? "Je parle. Si tu reparles, je m'arrete et je t'ecoute."
      : isRecordingVoice
        ? "Je t'ecoute. Des que tu t'arretes, j'envoie automatiquement."
        : isVoiceSessionActive
          ? "Session vocale active. Parle librement quand tu veux."
          : "Clique une fois, puis parle librement avec l'assistant.";

  const voiceStatusShort = isVoiceLoading
    ? "Thinking"
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
          className="[&>div]:rounded-2xl [&>div]:border [&>div]:border-border/30 [&>div]:bg-card/70 [&>div]:shadow-[var(--shadow-composer)] [&>div]:transition-shadow [&>div]:duration-300 [&>div]:focus-within:shadow-[var(--shadow-composer-focus)]"
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
        <div className="overflow-hidden rounded-[32px] border border-border/10 bg-black px-4 py-6 shadow-[var(--shadow-composer)] md:px-6 md:py-8">
          <div className="flex min-h-[520px] flex-col items-center justify-between md:min-h-[620px]">
            <div className="flex w-full justify-center pt-1">
              <div className="size-2 rounded-full bg-amber-400 shadow-[0_0_18px_rgba(251,191,36,0.85)]" />
            </div>

            <div className="flex flex-1 items-center justify-center py-8">
              <button
                className={cn(
                  "relative flex size-[240px] items-center justify-center rounded-full bg-white transition-all duration-300 md:size-[360px]",
                  isVoiceSessionActive &&
                    "scale-[1.03] shadow-[0_0_120px_rgba(255,255,255,0.22)]",
                  isVoiceLoading &&
                    "animate-pulse shadow-[0_0_120px_rgba(255,255,255,0.16)]"
                )}
                disabled={isVoiceSessionActive}
                onClick={() => {
                  if (!isVoiceSessionActive) {
                    void startVoiceSession();
                  }
                }}
                type="button"
              >
                {isRecordingVoice ? (
                  <SquareIcon className="size-8 fill-current text-black" />
                ) : isVoiceLoading ? (
                  <div className="text-sm font-medium text-black">...</div>
                ) : (
                  <MicIcon className="size-12 text-black" />
                )}
              </button>
            </div>

            <div className="flex flex-col items-center gap-2 pb-6 text-center">
              <div className="flex items-center gap-1.5">
                {[0, 1, 2, 3].map((index) => (
                  <span
                    className={cn(
                      "size-3 rounded-full bg-white transition-opacity",
                      isVoiceSessionActive ||
                        isVoiceLoading ||
                        isAssistantSpeaking
                        ? "animate-pulse opacity-100"
                        : "opacity-80"
                    )}
                    key={index}
                    style={{ animationDelay: `${index * 120}ms` }}
                  />
                ))}
              </div>
              <p className="text-sm text-white">{voiceStatusShort}</p>
              <p className="max-w-xs text-xs text-white/60">
                {voiceStatusLabel}
              </p>
            </div>

            <div className="grid w-full grid-cols-3 items-end gap-3">
              <div className="flex justify-start">
                <Button
                  className="rounded-full border border-white/15 bg-white/5 text-white hover:bg-white/10"
                  onClick={() => setInteractionMode("text")}
                  type="button"
                  variant="ghost"
                >
                  Texte
                </Button>
              </div>

              <div className="flex justify-center">
                <button
                  className="flex size-16 items-center justify-center rounded-full bg-red-500 text-white shadow-[0_12px_32px_rgba(239,68,68,0.35)] transition-transform hover:scale-105"
                  onClick={() => {
                    stopVoiceSession();
                  }}
                  type="button"
                >
                  <span className="text-3xl leading-none">×</span>
                </button>
              </div>

              <div className="flex justify-end">
                <div className="min-w-[88px] text-right">
                  <ModelSelectorCompact
                    onModelChange={onModelChange}
                    selectedModelId={selectedModelId}
                  />
                </div>
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

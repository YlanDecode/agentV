"use client";

import { FolderOpenIcon, MicIcon, PlayIcon, SquareIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { VoiceSample } from "@/lib/supabase/voices";

async function blobToWav(blob: Blob): Promise<Blob> {
  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx = new AudioContext();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  await audioCtx.close();

  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const length = audioBuffer.length;

  const samples = new Float32Array(length * numChannels);
  for (let ch = 0; ch < numChannels; ch++) {
    const channelData = audioBuffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      samples[i * numChannels + ch] = channelData[i];
    }
  }

  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  const dataSize = pcm.buffer.byteLength;
  const wav = new ArrayBuffer(44 + dataSize);
  const v = new DataView(wav);
  const str = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(offset + i, s.charCodeAt(i));
  };
  str(0, "RIFF"); v.setUint32(4, 36 + dataSize, true);
  str(8, "WAVE"); str(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, numChannels, true); v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * numChannels * 2, true);
  v.setUint16(32, numChannels * 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, dataSize, true);
  new Uint8Array(wav, 44).set(new Uint8Array(pcm.buffer));

  return new Blob([wav], { type: "audio/wav" });
}

export function VoiceRecorder() {
  const [voices, setVoices] = useState<VoiceSample[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(true);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [refText, setRefText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchVoices = useCallback(async () => {
    setLoadingVoices(true);
    try {
      const res = await fetch("/api/voices", { cache: "no-store" });
      const data = (await res.json()) as VoiceSample[];
      setVoices(data);
    } catch {
      setVoices([]);
    } finally {
      setLoadingVoices(false);
    }
  }, []);

  useEffect(() => {
    void fetchVoices();
  }, [fetchVoices]);

  const startRecording = useCallback(async () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setBlob(null);
    setSeconds(0);
    chunksRef.current = [];

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";

    const recorder = new MediaRecorder(stream, { mimeType });
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const recorded = new Blob(chunksRef.current, { type: recorder.mimeType });
      setBlob(recorded);
      setPreviewUrl(URL.createObjectURL(recorded));
      stream.getTracks().forEach((t) => t.stop());
    };

    recorder.start();
    setIsRecording(true);

    timerRef.current = window.setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);
  }, [previewUrl]);

  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  }, []);

  const pickFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setBlob(file);
    setPreviewUrl(URL.createObjectURL(file));
    setSeconds(0);
    e.target.value = "";
  }, [previewUrl]);

  const upload = useCallback(async () => {
    if (!blob || !name.trim()) return;
    setUploading(true);
    setUploadStatus("");

    const wavBlob = blob.type === "audio/wav" ? blob : await blobToWav(blob);
    const formData = new FormData();
    formData.append("audio", wavBlob, "sample.wav");
    formData.append("name", name.trim());
    formData.append("reference_text", refText.trim());

    try {
      const res = await fetch("/api/voices", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload échoué");
      setUploadStatus("Voix sauvegardée.");
      setBlob(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setName("");
      setRefText("");
      setSeconds(0);
      await fetchVoices();
    } catch {
      setUploadStatus("Erreur lors de l'upload.");
    } finally {
      setUploading(false);
    }
  }, [blob, name, refText, previewUrl, fetchVoices]);

  const deleteVoice = useCallback(async (id: string) => {
    await fetch(`/api/voices/${id}`, { method: "DELETE" });
    setVoices((v) => v.filter((x) => x.id !== id));
  }, []);

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-5">
      {/* Enregistrement */}
      <div className="rounded-xl border border-border bg-background p-4 space-y-4">
        <p className="text-xs font-medium text-muted-foreground">
          Enregistre au moins 20-30 secondes de voix naturelle pour creer une voix Noiz.
        </p>

        <input
          accept="audio/*"
          className="hidden"
          onChange={onFileChange}
          ref={fileInputRef}
          type="file"
        />
        <div className="flex items-center gap-3">
          {!isRecording ? (
            <button
              className="flex items-center gap-2 rounded-xl bg-foreground px-4 py-2 text-sm text-background hover:opacity-90 disabled:opacity-50"
              disabled={isRecording}
              onClick={() => void startRecording()}
              type="button"
            >
              <MicIcon className="size-4" />
              {blob ? "Ré-enregistrer" : "Enregistrer"}
            </button>
          ) : (
            <button
              className="flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2 text-sm text-white hover:bg-red-600"
              onClick={stopRecording}
              type="button"
            >
              <SquareIcon className="size-4 fill-current" />
              Arrêter — {fmt(seconds)}
            </button>
          )}
          {!isRecording && (
            <button
              className="flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm text-foreground hover:bg-muted"
              onClick={pickFile}
              type="button"
            >
              <FolderOpenIcon className="size-4" />
              Importer un fichier
            </button>
          )}

          {isRecording && (
            <div className="flex items-end gap-[3px]" style={{ height: 20 }}>
              {[10, 16, 12, 18, 10].map((h, i) => (
                <div
                  key={i}
                  className="w-[3px] rounded-full bg-foreground animate-bounce"
                  style={{ height: h, animationDelay: `${i * 90}ms`, animationDuration: "550ms" }}
                />
              ))}
            </div>
          )}
        </div>

        {previewUrl && (
          <div className="space-y-3">
            {/* biome-ignore lint/a11y/useMediaCaption: voice preview */}
            <audio className="w-full h-10" controls src={previewUrl} />

            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Nom de la voix *
                </span>
                <input
                  className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ex: CEO Martin"
                  type="text"
                  value={name}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Transcription de référence (optionnel, améliore la qualité)
                </span>
                <input
                  className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
                  onChange={(e) => setRefText(e.target.value)}
                  placeholder="ex: Bonjour, je m'appelle Martin..."
                  type="text"
                  value={refText}
                />
              </label>
            </div>

            <div className="flex items-center gap-3">
              <button
                className="flex items-center gap-2 rounded-xl bg-foreground px-4 py-2 text-sm text-background hover:opacity-90 disabled:opacity-50"
                disabled={uploading || !name.trim()}
                onClick={() => void upload()}
                type="button"
              >
                <UploadIcon className="size-4" />
                {uploading ? "Sauvegarde..." : "Sauvegarder la voix"}
              </button>
              {uploadStatus && (
                <p className="text-sm text-muted-foreground">{uploadStatus}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Liste des voix sauvegardées */}
      <div className="space-y-2">
        {loadingVoices ? (
          <p className="text-sm text-muted-foreground">Chargement...</p>
        ) : voices.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucune voix enregistrée. Clique sur "Enregistrer" pour commencer.
          </p>
        ) : (
          voices.map((v) => (
            <div
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3"
              key={v.id}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{v.name}</p>
                {v.reference_text && (
                  <p className="truncate text-xs text-muted-foreground">
                    {v.reference_text}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  className="flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground"
                  href={v.url}
                  rel="noreferrer"
                  target="_blank"
                  title="Écouter"
                >
                  <PlayIcon className="size-3.5" />
                </a>
                <button
                  className="flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:border-red-300 hover:text-red-500"
                  onClick={() => void deleteVoice(v.id)}
                  title="Supprimer"
                  type="button"
                >
                  <Trash2Icon className="size-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

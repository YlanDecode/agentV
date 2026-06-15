"use client";

import { FolderOpenIcon, MicIcon, MoreHorizontalIcon, PlayIcon, SquareIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { deleteVoice as deleteVoiceRequest, listVoices, uploadVoice } from '@/lib/agentvocal-admin-api';
import { getApiErrorMessage } from '@/lib/axios';
import type { VoiceSample } from "@/lib/supabase/voices";
import { ConsentButton } from "@/components/voice/consent-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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
      setVoices(await listVoices());
    } catch (error) {
      setVoices([]);
      setUploadStatus(getApiErrorMessage(error, 'Impossible de charger les voix enregistrées.'));
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
      await uploadVoice(formData);
      setUploadStatus("Voix sauvegardée.");
      setBlob(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setName("");
      setRefText("");
      setSeconds(0);
      await fetchVoices();
    } catch (error) {
      setUploadStatus(getApiErrorMessage(error, 'Impossible d’enregistrer cette voix.'));
    } finally {
      setUploading(false);
    }
  }, [blob, name, refText, previewUrl, fetchVoices]);

  const deleteVoice = useCallback(async (id: string) => {
    try {
      await deleteVoiceRequest(id);
      setVoices((v) => v.filter((x) => x.id !== id));
      setUploadStatus('Voix supprimée.');
    } catch (error) {
      setUploadStatus(getApiErrorMessage(error, 'Impossible de supprimer cette voix.'));
    }
  }, []);

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-3xl border border-border/70 bg-background/80 p-5 md:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Étape 1
              </p>
              <h2 className="mt-2 text-lg font-semibold text-foreground">Capturer ou importer un échantillon</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Enregistrez directement une voix ou chargez un fichier audio existant.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
              cible: 20-30s
            </div>
          </div>

          <input
            accept="audio/*"
            className="hidden"
            onChange={onFileChange}
            ref={fileInputRef}
            type="file"
          />

          <div className="mt-5 flex flex-wrap items-center gap-3">
            {!isRecording ? (
              <button
                className="flex items-center gap-2 rounded-2xl bg-foreground px-4 py-2.5 text-sm text-background hover:opacity-90 disabled:opacity-50"
                disabled={isRecording}
                onClick={() => void startRecording()}
                type="button"
              >
                <MicIcon className="size-4" />
                {blob ? "Refaire l'enregistrement" : "Enregistrer une voix"}
              </button>
            ) : (
              <button
                className="flex items-center gap-2 rounded-2xl bg-red-500 px-4 py-2.5 text-sm text-white hover:bg-red-600"
                onClick={stopRecording}
                type="button"
              >
                <SquareIcon className="size-4 fill-current" />
                Arrêter • {fmt(seconds)}
              </button>
            )}

            {!isRecording && (
              <button
                className="flex items-center gap-2 rounded-2xl border border-border px-4 py-2.5 text-sm text-foreground hover:bg-muted"
                onClick={pickFile}
                type="button"
              >
                <FolderOpenIcon className="size-4" />
                Importer un fichier audio
              </button>
            )}

            {isRecording && (
              <div className="flex items-end gap-[3px] rounded-full border border-border bg-muted px-3 py-2" style={{ height: 36 }}>
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

          <div className="mt-5 rounded-2xl border border-border bg-card/60 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Conseil pratique</p>
            <p className="mt-1 leading-6">
              Préférez une voix calme, sans bruit de fond, avec une diction naturelle. Une
              seule bonne prise vaut mieux que plusieurs échantillons moyens.
            </p>
          </div>
        </section>

        <section className="rounded-3xl border border-border/70 bg-background/80 p-5 md:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Étape 2
          </p>
          <h2 className="mt-2 text-lg font-semibold text-foreground">Nommer et sauvegarder</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Une fois l&apos;échantillon prêt, donnez-lui un nom clair puis enregistrez-le.
          </p>

          {previewUrl ? (
            <div className="mt-5 space-y-4">
              {/* biome-ignore lint/a11y/useMediaCaption: voice preview */}
              <audio className="h-11 w-full" controls src={previewUrl} />

              <div className="space-y-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Nom de la voix *</span>
                  <input
                    className="h-10 rounded-2xl border border-border bg-background px-3 text-sm"
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: standard accueil, CEO Martin, SAV premium"
                    type="text"
                    value={name}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    Transcription de référence (optionnel)
                  </span>
                  <input
                    className="h-10 rounded-2xl border border-border bg-background px-3 text-sm"
                    onChange={(e) => setRefText(e.target.value)}
                    placeholder="Ex: Bonjour, je m'appelle Martin et je vous souhaite la bienvenue."
                    type="text"
                    value={refText}
                  />
                </label>
              </div>

              <button
                className="inline-flex items-center gap-2 rounded-2xl bg-foreground px-4 py-2.5 text-sm text-background hover:opacity-90 disabled:opacity-50"
                disabled={uploading || !name.trim()}
                onClick={() => void upload()}
                type="button"
              >
                <UploadIcon className="size-4" />
                {uploading ? "Sauvegarde..." : "Sauvegarder cette voix"}
              </button>
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-dashed border-border bg-card/40 p-5 text-sm text-muted-foreground">
              Capturez ou importez d&apos;abord un échantillon. Le formulaire de sauvegarde
              apparaîtra ici automatiquement.
            </div>
          )}

          {uploadStatus && (
            <p className="mt-4 text-sm text-muted-foreground">{uploadStatus}</p>
          )}
        </section>
      </div>

      <section className="rounded-3xl border border-border/70 bg-background/80 p-5 md:p-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Étape 3
            </p>
            <h2 className="mt-2 text-lg font-semibold text-foreground">Bibliothèque des voix</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Écoutez, vérifiez le consentement et supprimez les doublons inutiles.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {loadingVoices ? (
            <p className="text-sm text-muted-foreground">Chargement...</p>
          ) : voices.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card/40 p-5 text-sm text-muted-foreground">
              Aucune voix enregistrée pour le moment. Commencez par créer votre première voix.
            </div>
          ) : (
            voices.map((v) => (
              <div
                className="flex flex-col gap-3 rounded-2xl border border-border bg-card/50 p-4 sm:flex-row sm:items-center sm:justify-between"
                key={v.id}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{v.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {v.reference_text || 'Aucune transcription de référence enregistrée.'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <ConsentButton voiceId={v.id} voiceName={v.name} />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="flex size-9 items-center justify-center rounded-xl border border-border text-muted-foreground hover:text-foreground"
                        title="Actions"
                        type="button"
                      >
                        <MoreHorizontalIcon className="size-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem asChild>
                        <a href={v.url} rel="noreferrer" target="_blank">
                          <PlayIcon className="size-4" />
                          Écouter
                        </a>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => void deleteVoice(v.id)} variant="destructive">
                        <Trash2Icon className="size-4" />
                        Supprimer
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

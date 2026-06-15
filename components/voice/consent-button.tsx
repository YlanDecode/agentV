"use client";

import { ShieldCheckIcon, ShieldOffIcon, ShieldIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchVoiceConsent,
  grantVoiceConsent,
  revokeVoiceConsent,
} from '@/lib/agentvocal-admin-api';
import { ApiClientError, getApiErrorMessage } from '@/lib/axios';

type ConsentStatus =
  | { state: "loading" }
  | { state: "none" }
  | { state: "active"; consented_by: string; purpose: string; created_at: string }
  | { state: "error" };

interface ConsentButtonProps {
  voiceId: string;
  voiceName: string;
}

export function ConsentButton({ voiceId, voiceName }: ConsentButtonProps) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ConsentStatus>({ state: "loading" });
  const [consentedBy, setConsentedBy] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  const fetchConsent = useCallback(async () => {
    setStatus({ state: "loading" });
    setMessage("");
    try {
      const data = await fetchVoiceConsent(voiceId);
      setStatus({ state: "active", ...data });
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 404) {
        setStatus({ state: "none" });
      } else {
        setStatus({ state: "error" });
        setMessage(getApiErrorMessage(error, 'Impossible de charger le statut de consentement.'));
      }
    }
  }, [voiceId]);

  useEffect(() => {
    if (open) void fetchConsent();
  }, [open, fetchConsent]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const grant = async () => {
    if (!consentedBy.trim()) return;
    setSaving(true);
    setMessage("");
    try {
      await grantVoiceConsent(voiceId, {
        consented_by: consentedBy.trim(),
        purpose: 'voice_cloning',
      });
      setMessage("Consentement accordé.");
      setConsentedBy("");
      await fetchConsent();
    } catch (error) {
      setMessage(getApiErrorMessage(error, 'Impossible d’accorder le consentement.'));
    } finally {
      setSaving(false);
    }
  };

  const revoke = async () => {
    setSaving(true);
    setMessage("");
    try {
      await revokeVoiceConsent(voiceId);
      setMessage("Consentement révoqué.");
      await fetchConsent();
    } catch (error) {
      setMessage(getApiErrorMessage(error, 'Impossible de révoquer le consentement.'));
    } finally {
      setSaving(false);
    }
  };

  const Icon =
    status.state === "active"
      ? ShieldCheckIcon
      : status.state === "none"
        ? ShieldOffIcon
        : ShieldIcon;

  const iconClass =
    status.state === "active"
      ? "text-green-500"
      : status.state === "none"
        ? "text-muted-foreground/50"
        : "text-muted-foreground";

  return (
    <div className="relative" ref={panelRef}>
      <button
        aria-label="Gérer le consentement vocal"
        className="flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((o) => !o)}
        title="Consentement vocal"
        type="button"
      >
        <Icon className={`size-3.5 ${iconClass}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-72 rounded-xl border border-border bg-background p-4 shadow-xl">
          <p className="mb-3 text-sm font-semibold">
            Consentement — {voiceName}
          </p>

          {status.state === "loading" && (
            <p className="text-xs text-muted-foreground">Chargement...</p>
          )}

          {status.state === "error" && (
            <p className="text-xs text-red-500">{message || 'Impossible de charger le statut.'}</p>
          )}

          {status.state === "active" && (
            <div className="space-y-3">
              <div className="rounded-lg bg-green-500/10 px-3 py-2 text-xs">
                <p className="font-medium text-green-600">Consentement actif</p>
                <p className="mt-1 text-muted-foreground">
                  Accordé par <strong>{status.consented_by}</strong>
                </p>
                <p className="text-muted-foreground">
                  {new Date(status.created_at).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
                <p className="text-muted-foreground">Objet : {status.purpose}</p>
              </div>
              <button
                className="w-full rounded-lg border border-red-300 px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 disabled:opacity-50"
                disabled={saving}
                onClick={() => void revoke()}
                type="button"
              >
                {saving ? "Révocation..." : "Révoquer le consentement"}
              </button>
            </div>
          )}

          {status.state === "none" && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Aucun consentement actif pour le clonage de cette voix.
              </p>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Accordé par *</span>
                <input
                  className="h-9 rounded-lg border border-border bg-background px-2.5 text-xs"
                  onChange={(e) => setConsentedBy(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void grant()}
                  placeholder="Nom ou identifiant de la personne"
                  value={consentedBy}
                />
              </label>
              <button
                className="w-full rounded-lg bg-foreground px-3 py-1.5 text-xs text-background hover:opacity-90 disabled:opacity-50"
                disabled={saving || !consentedBy.trim()}
                onClick={() => void grant()}
                type="button"
              >
                {saving ? "Enregistrement..." : "Accorder le consentement"}
              </button>
            </div>
          )}

          {message && (
            <p className="mt-2 text-xs text-muted-foreground">{message}</p>
          )}
        </div>
      )}
    </div>
  );
}

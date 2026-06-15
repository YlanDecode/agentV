"use client";

import { FileTextIcon, PlusIcon, Trash2Icon, UploadIcon, SearchIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type RagDocument = {
  id: string;
  title: string;
  content: string;
  source_format: string;
  is_indexed: boolean;
  created_at: string;
};

type CreateForm = {
  title: string;
  content: string;
  source_format: string;
};

const EMPTY_FORM: CreateForm = { title: "", content: "", source_format: "txt" };
const FORMAT_OPTIONS = ["txt", "md", "pdf", "docx", "csv", "html"];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function truncate(text: string, max = 120) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function RagDocuments() {
  const [docs, setDocs] = useState<RagDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/rag", { cache: "no-store" });
      const data = (await res.json()) as { items?: RagDocument[] } | RagDocument[];
      setDocs(Array.isArray(data) ? data : (data.items ?? []));
    } catch {
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDocs();
  }, [fetchDocs]);

  const createDocument = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      setStatus("Le titre et le contenu sont requis.");
      return;
    }
    setSaving(true);
    setStatus("");
    try {
      const res = await fetch("/api/rag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          content: form.content.trim(),
          source_format: form.source_format,
        }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { detail?: string };
        throw new Error(err.detail ?? "Erreur de création");
      }
      setStatus("Document ajouté et indexé.");
      setForm(EMPTY_FORM);
      setShowForm(false);
      await fetchDocs();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Erreur lors de la création.");
    } finally {
      setSaving(false);
    }
  };

  const uploadFile = async (file: File) => {
    setSaving(true);
    setStatus("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", file.name.replace(/\.[^.]+$/, ""));
      const res = await fetch("/api/rag", { method: "POST", body: formData });
      if (!res.ok) {
        const err = (await res.json()) as { detail?: string };
        throw new Error(err.detail ?? "Erreur d'upload");
      }
      setStatus(`"${file.name}" importé et indexé.`);
      await fetchDocs();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Erreur lors de l'import.");
    } finally {
      setSaving(false);
    }
  };

  const deleteDoc = async (id: string) => {
    if (!confirm("Supprimer ce document de la base RAG ?")) return;
    try {
      const res = await fetch(`/api/rag/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Suppression échouée");
      setDocs((d) => d.filter((doc) => doc.id !== id));
      setStatus("Document supprimé.");
    } catch {
      setStatus("Erreur lors de la suppression.");
    }
  };

  const filtered = search
    ? docs.filter(
        (d) =>
          d.title.toLowerCase().includes(search.toLowerCase()) ||
          d.content.toLowerCase().includes(search.toLowerCase())
      )
    : docs;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <SearchIcon className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            className="h-9 w-full rounded-xl border border-border bg-background pl-8 pr-3 text-sm"
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un document..."
            value={search}
          />
        </div>

        <input
          accept=".txt,.md,.markdown,.pdf,.docx,.csv,.html"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadFile(file);
            e.target.value = "";
          }}
          ref={fileInputRef}
          type="file"
        />
        <button
          className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm text-foreground hover:bg-muted disabled:opacity-50"
          disabled={saving}
          onClick={() => fileInputRef.current?.click()}
          type="button"
        >
          <UploadIcon className="size-3.5" />
          Importer fichier
        </button>

        <button
          className="flex items-center gap-1.5 rounded-xl bg-foreground px-3 py-2 text-sm text-background hover:opacity-90"
          onClick={() => {
            setShowForm((v) => !v);
            setStatus("");
          }}
          type="button"
        >
          <PlusIcon className="size-3.5" />
          Nouveau document
        </button>
      </div>

      {/* Inline create form */}
      {showForm && (
        <div className="rounded-xl border border-border bg-background p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Nouveau document texte
          </p>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Titre *</span>
            <input
              className="h-9 rounded-xl border border-border bg-background px-3 text-sm"
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Ex: FAQ produits 2025"
              value={form.title}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Contenu *</span>
            <textarea
              className="min-h-32 rounded-xl border border-border bg-background px-3 py-2 text-sm resize-y"
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              placeholder="Collez le contenu du document ici..."
              value={form.content}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Format</span>
            <select
              className="h-9 rounded-xl border border-border bg-background px-3 text-sm"
              onChange={(e) => setForm((f) => ({ ...f, source_format: e.target.value }))}
              value={form.source_format}
            >
              {FORMAT_OPTIONS.map((fmt) => (
                <option key={fmt} value={fmt}>
                  {fmt.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-2 pt-1">
            <button
              className="rounded-xl bg-foreground px-4 py-2 text-sm text-background hover:opacity-90 disabled:opacity-50"
              disabled={saving || !form.title.trim() || !form.content.trim()}
              onClick={() => void createDocument()}
              type="button"
            >
              {saving ? "Indexation..." : "Ajouter et indexer"}
            </button>
            <button
              className="rounded-xl border border-border px-4 py-2 text-sm text-foreground hover:bg-muted"
              onClick={() => {
                setShowForm(false);
                setForm(EMPTY_FORM);
              }}
              type="button"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {status && (
        <p className="text-sm text-muted-foreground">{status}</p>
      )}

      {/* Document list */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {docs.length === 0
            ? "Aucun document dans la base RAG. Importez un fichier ou créez un document texte."
            : "Aucun document correspondant à la recherche."}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((doc) => (
            <div
              className="flex items-start justify-between gap-3 rounded-xl border border-border bg-background p-3"
              key={doc.id}
            >
              <div className="flex min-w-0 flex-1 items-start gap-2.5">
                <FileTextIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">{doc.title}</p>
                    <span className="shrink-0 rounded-md border border-border px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                      {doc.source_format}
                    </span>
                    {doc.is_indexed ? (
                      <span className="shrink-0 rounded-md bg-green-500/10 px-1.5 py-0.5 text-[10px] text-green-600">
                        indexé
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-md bg-yellow-500/10 px-1.5 py-0.5 text-[10px] text-yellow-600">
                        en attente
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {truncate(doc.content)} · {formatDate(doc.created_at)}
                  </p>
                </div>
              </div>
              <button
                className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:border-red-300 hover:text-red-500"
                onClick={() => void deleteDoc(doc.id)}
                title="Supprimer"
                type="button"
              >
                <Trash2Icon className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

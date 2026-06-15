"use client";

import {
  FileTextIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SaveIcon,
  SearchIcon,
  Trash2Icon,
  UploadIcon,
  XIcon,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  type RagDocument,
  createRagDocument,
  deleteRagDocument,
  listRagDocuments,
  updateRagDocument,
  uploadRagDocument,
} from '@/lib/agentvocal-admin-api';
import { getApiErrorMessage } from '@/lib/axios';

type CreateForm = {
  title: string;
  content: string;
  source_format: RagDocument['source_format'];
};

const EMPTY_FORM: CreateForm = { title: "", content: "", source_format: "txt" };
const FORMAT_OPTIONS = ["txt", "md", "csv"];

type StatusState = {
  tone: 'success' | 'error';
  message: string;
} | null;

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
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<CreateForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<StatusState>(null);
  const [search, setSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      setDocs(await listRagDocuments());
    } catch (error) {
      setDocs([]);
      setStatus({
        tone: 'error',
        message: getApiErrorMessage(error, 'Impossible de charger les documents RAG.'),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDocs();
  }, [fetchDocs]);

  const createDocument = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      setStatus({ tone: 'error', message: 'Le titre et le contenu sont requis.' });
      return;
    }

    setSaving(true);
    setStatus(null);

    try {
      const created = await createRagDocument({
        title: form.title.trim(),
        content: form.content.trim(),
        source_format: form.source_format,
      });

      setDocs((current) => [created, ...current.filter((doc) => doc.id !== created.id)]);
      setStatus({ tone: 'success', message: 'Document ajouté et indexé.' });
      setForm(EMPTY_FORM);
      setShowForm(false);
    } catch (error) {
      setStatus({
        tone: 'error',
        message: getApiErrorMessage(error, 'Erreur lors de la création du document.'),
      });
    } finally {
      setSaving(false);
    }
  };

  const uploadFile = async (file: File) => {
    setSaving(true);
    setStatus(null);

    try {
      const created = await uploadRagDocument(file, file.name.replace(/\.[^.]+$/, ''));
      setDocs((current) => [created, ...current.filter((doc) => doc.id !== created.id)]);
      setStatus({ tone: 'success', message: `"${file.name}" importé et indexé.` });
    } catch (error) {
      setStatus({
        tone: 'error',
        message: getApiErrorMessage(error, `Impossible d'importer le fichier ${file.name}.`),
      });
    } finally {
      setSaving(false);
    }
  };

  const startEditing = (doc: RagDocument) => {
    setEditingId(doc.id);
    setEditForm({
      title: doc.title,
      content: doc.content,
      source_format: doc.source_format,
    });
    setStatus(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditForm(EMPTY_FORM);
  };

  const saveEdition = async () => {
    if (editingId === null) {
      return;
    }

    if (!editForm.title.trim() || !editForm.content.trim()) {
      setStatus({ tone: 'error', message: 'Le titre et le contenu sont requis pour enregistrer les modifications.' });
      return;
    }

    setSaving(true);
    setStatus(null);

    try {
      const updated = await updateRagDocument(editingId, {
        title: editForm.title.trim(),
        content: editForm.content.trim(),
        source_format: editForm.source_format,
      });

      setDocs((current) => current.map((doc) => (doc.id === updated.id ? updated : doc)));
      setStatus({ tone: 'success', message: 'Document mis à jour et réindexé.' });
      cancelEditing();
    } catch (error) {
      setStatus({
        tone: 'error',
        message: getApiErrorMessage(error, 'Impossible de mettre à jour ce document.'),
      });
    } finally {
      setSaving(false);
    }
  };

  const deleteDoc = async (id: number) => {
    if (!confirm("Supprimer ce document de la base RAG ?")) return;

    try {
      await deleteRagDocument(id);
      setDocs((d) => d.filter((doc) => doc.id !== id));
      if (editingId === id) {
        cancelEditing();
      }
      setStatus({ tone: 'success', message: 'Document supprimé.' });
    } catch (error) {
      setStatus({
        tone: 'error',
        message: getApiErrorMessage(error, 'Impossible de supprimer ce document.'),
      });
    }
  };

  const filtered = search
    ? docs.filter(
        (d) =>
          d.title.toLowerCase().includes(search.toLowerCase()) ||
          d.content.toLowerCase().includes(search.toLowerCase()) ||
          (d.original_filename ?? '').toLowerCase().includes(search.toLowerCase())
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
          accept=".txt,.md,.markdown,.csv,text/plain,text/markdown,text/csv"
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
            setStatus(null);
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
              onChange={(e) => setForm((f) => ({
                ...f,
                source_format: e.target.value as RagDocument['source_format'],
              }))}
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
        <p className={status.tone === 'error' ? 'text-sm text-red-500' : 'text-sm text-green-600'}>{status.message}</p>
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
              className="rounded-xl border border-border bg-background p-3"
              key={doc.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-start gap-2.5">
                  <FileTextIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium">{doc.title}</p>
                      <span className="shrink-0 rounded-md border border-border px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                        {doc.source_format}
                      </span>
                      <span className="shrink-0 rounded-md bg-green-500/10 px-1.5 py-0.5 text-[10px] text-green-600">
                        indexé
                      </span>
                      {!doc.active && (
                        <span className="shrink-0 rounded-md bg-yellow-500/10 px-1.5 py-0.5 text-[10px] text-yellow-700">
                          inactif
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {truncate(doc.content)} · mis à jour le {formatDate(doc.updated_at || doc.created_at)}
                    </p>
                    {doc.original_filename && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Fichier source : {doc.original_filename}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="flex size-8 items-center justify-center rounded-xl border border-border text-muted-foreground hover:border-foreground hover:text-foreground"
                        title="Actions"
                        type="button"
                      >
                        <MoreHorizontalIcon className="size-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onClick={() => startEditing(doc)}>
                        <PencilIcon className="size-4" />
                        Modifier
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => void deleteDoc(doc.id)} variant="destructive">
                        <Trash2Icon className="size-4" />
                        Supprimer
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {editingId === doc.id && (
                <div className="mt-4 space-y-3 border-t border-border pt-4">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted-foreground">Titre</span>
                    <input
                      className="h-9 rounded-xl border border-border bg-background px-3 text-sm"
                      onChange={(e) => setEditForm((current) => ({ ...current, title: e.target.value }))}
                      value={editForm.title}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted-foreground">Contenu</span>
                    <textarea
                      className="min-h-36 rounded-xl border border-border bg-background px-3 py-2 text-sm resize-y"
                      onChange={(e) => setEditForm((current) => ({ ...current, content: e.target.value }))}
                      value={editForm.content}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted-foreground">Format</span>
                    <select
                      className="h-9 rounded-xl border border-border bg-background px-3 text-sm"
                      onChange={(e) => setEditForm((current) => ({
                        ...current,
                        source_format: e.target.value as RagDocument['source_format'],
                      }))}
                      value={editForm.source_format}
                    >
                      {FORMAT_OPTIONS.map((fmt) => (
                        <option key={fmt} value={fmt}>
                          {fmt.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      className="inline-flex items-center gap-1.5 rounded-xl bg-foreground px-4 py-2 text-sm text-background hover:opacity-90 disabled:opacity-50"
                      disabled={saving}
                      onClick={() => void saveEdition()}
                      type="button"
                    >
                      <SaveIcon className="size-3.5" />
                      {saving ? 'Enregistrement...' : 'Enregistrer'}
                    </button>
                    <button
                      className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm text-foreground hover:bg-muted"
                      onClick={cancelEditing}
                      type="button"
                    >
                      <XIcon className="size-3.5" />
                      Annuler
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

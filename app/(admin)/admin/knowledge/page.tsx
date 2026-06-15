"use client";

import Papa from "papaparse";
import { useEffect, useMemo, useRef, useState } from "react";

type KnowledgeEntry = { id: number; categorie: string; question: string; reponse: string };
type Product = {
  id: number;
  nom: string;
  description: string | null;
  prix_mensuel: number | null;
  prix_annuel: number | null;
  fonctionnalites: string | null;
};
type Example = { id: number; category: string; user_input: string; persona_response: string };
type ImportedEntry = { question: string; reponse: string };

export default function KnowledgePage() {
  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeEntry[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [examples, setExamples] = useState<Example[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = async () => {
    const response = await fetch("/api/settings/clone", { cache: "no-store" });
    if (!response.ok) {
      setStatus("Impossible de charger les données.");
      setLoading(false);
      return;
    }
    const payload = await response.json() as {
      knowledgeBase: KnowledgeEntry[];
      products: Product[];
      examples: Example[];
    };
    setKnowledgeBase(payload.knowledgeBase);
    setProducts(payload.products);
    setExamples(payload.examples);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const knowledgeCategories = useMemo(
    () => Array.from(new Set(knowledgeBase.map((item) => item.categorie))),
    [knowledgeBase]
  );

  const parseTextKnowledge = (content: string, sourceName: string): ImportedEntry[] => {
    const normalized = content.replace(/\r\n/g, "\n").trim();
    if (!normalized) return [];
    const qaMatches = [...normalized.matchAll(/(?:^|\n)Q\s*[:\-]\s*(.+?)\nA\s*[:\-]\s*([\s\S]*?)(?=\nQ\s*[:\-]|$)/gi)];
    if (qaMatches.length > 0) {
      return qaMatches
        .map((m) => ({ question: m[1].trim(), reponse: m[2].trim() }))
        .filter((e) => e.question && e.reponse);
    }
    return normalized
      .split(/\n\s*\n/)
      .map((p) => p.replace(/^#+\s*/gm, "").trim())
      .filter((p) => p.length >= 40)
      .slice(0, 12)
      .map((p, i) => ({
        question: i === 0
          ? `Quels sont les points importants dans ${sourceName} ?`
          : `Quel autre point important faut-il retenir de ${sourceName} ?`,
        reponse: p,
      }));
  };

  const parseCsvKnowledge = (content: string, sourceName: string): ImportedEntry[] => {
    const parsed = Papa.parse<Record<string, string>>(content, { header: true, skipEmptyLines: true });
    const rows = Array.isArray(parsed.data) ? parsed.data : [];
    if (rows.length === 0) return [];
    const headers = Object.keys(rows[0] ?? {});
    const findHeader = (candidates: string[]) =>
      headers.find((h) => candidates.includes(h.trim().toLowerCase()));
    const qh = findHeader(["question", "q", "demande"]);
    const ah = findHeader(["reponse", "réponse", "answer", "a"]);
    if (qh && ah) {
      return rows
        .map((r) => ({ question: String(r[qh] ?? "").trim(), reponse: String(r[ah] ?? "").trim() }))
        .filter((e) => e.question && e.reponse)
        .slice(0, 24);
    }
    if (headers.length >= 2) {
      return rows
        .map((r) => ({
          question: String(r[headers[0]] ?? "").trim(),
          reponse: headers.slice(1).map((h) => String(r[h] ?? "")).filter(Boolean).join(" | "),
        }))
        .filter((e) => e.question && e.reponse)
        .slice(0, 24);
    }
    const raw = Papa.parse<string[]>(content, { header: false, skipEmptyLines: true }).data;
    return raw
      .map((r) => ({ question: r[0]?.trim() ?? `Info de ${sourceName}`, reponse: r.slice(1).join(" | ").trim() }))
      .filter((e) => e.question && e.reponse)
      .slice(0, 24);
  };

  const parseKnowledgeFile = async (file: File): Promise<ImportedEntry[]> => {
    const content = await file.text();
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".csv") || file.type.includes("csv")) {
      return parseCsvKnowledge(content, file.name);
    }
    return parseTextKnowledge(content, file.name);
  };

  const importFiles = async (files: FileList | File[]) => {
    const selected = [...files].filter((f) => /\.(txt|md|markdown|csv)$/i.test(f.name));
    if (selected.length === 0) {
      setStatus("Aucun fichier compatible (.txt, .md, .csv).");
      return;
    }
    setUploading(true);
    setStatus("");
    try {
      for (const file of selected) {
        const entries = await parseKnowledgeFile(file);
        if (entries.length === 0) continue;
        const response = await fetch("/api/settings/knowledge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceName: file.name, entries }),
        });
        if (!response.ok) throw new Error(`Import impossible pour ${file.name}`);
      }
      await load();
      setStatus("Documents importés dans la base de connaissances.");
    } catch {
      setStatus("Erreur pendant l'import des documents.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
      <div>
        <h1 className="text-xl font-semibold">Base de connaissances</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Import de fichiers Q/R injectés dans le prompt de l&apos;agent.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Chargement...</p>
      ) : (
        <div className="space-y-6">
          {/* Import zone */}
          <section className="rounded-2xl border border-border bg-card/70 p-4 md:p-5">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Importer des documents
            </h2>
            <input
              accept=".txt,.md,.markdown,.csv,text/plain,text/markdown,text/csv"
              className="hidden"
              multiple
              onChange={(e) => {
                if (e.currentTarget.files) void importFiles(e.currentTarget.files);
                e.currentTarget.value = "";
              }}
              ref={fileInputRef}
              type="file"
            />
            <div
              className="rounded-xl border border-dashed border-border/80 p-5 text-sm text-muted-foreground"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files?.length) void importFiles(e.dataTransfer.files);
              }}
            >
              <p className="font-medium text-foreground">
                Glisse-dépose des fichiers <code>.txt</code>, <code>.md</code> ou <code>.csv</code>
              </p>
              <p className="mt-1 text-xs">
                Les Q/R explicites et paragraphes importants sont extraits et injectés dans le prompt.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  className="rounded-xl bg-foreground px-3 py-2 text-sm text-background disabled:opacity-50"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                >
                  {uploading ? "Import..." : "Choisir des fichiers"}
                </button>
                {knowledgeCategories.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Sources : {knowledgeCategories.join(", ")}
                  </p>
                )}
              </div>
            </div>
            {status && <p className="mt-3 text-sm text-muted-foreground">{status}</p>}
          </section>

          {/* Knowledge Base preview */}
          <section className="rounded-2xl border border-border bg-card/70 p-4 md:p-5">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Entrées actives ({knowledgeBase.length})
            </h2>
            <PreviewList
              emptyLabel="Aucune entrée knowledge_base active."
              items={knowledgeBase.map((item) => ({
                id: item.id,
                title: `${item.categorie} · ${item.question}`,
                body: item.reponse,
              }))}
            />
          </section>

          {/* Products preview */}
          <section className="rounded-2xl border border-border bg-card/70 p-4 md:p-5">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Produits utilisés par le prompt ({products.length})
            </h2>
            <PreviewList
              emptyLabel="Aucun produit actif."
              items={products.map((item) => ({
                id: item.id,
                title: item.nom,
                body: [
                  item.description,
                  item.prix_mensuel != null ? `${item.prix_mensuel}/mois` : null,
                  item.prix_annuel != null ? `${item.prix_annuel}/an` : null,
                  item.fonctionnalites,
                ]
                  .filter(Boolean)
                  .join(" · "),
              }))}
            />
          </section>

          {/* Examples preview */}
          <section className="rounded-2xl border border-border bg-card/70 p-4 md:p-5">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Exemples persona ({examples.length})
            </h2>
            <PreviewList
              emptyLabel="Aucun exemple persona."
              items={examples.map((item) => ({
                id: item.id,
                title: item.category,
                body: `User: ${item.user_input}\nAssistant: ${item.persona_response}`,
              }))}
            />
          </section>
        </div>
      )}
    </div>
  );
}

function PreviewList({
  items,
  emptyLabel,
}: {
  items: Array<{ id: number; title: string; body: string }>;
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div className="rounded-xl border border-border bg-background p-3" key={item.id}>
          <p className="text-sm font-medium">{item.title}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{item.body}</p>
        </div>
      ))}
    </div>
  );
}

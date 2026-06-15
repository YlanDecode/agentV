import Link from "next/link";
import { BookOpenIcon, BotIcon, MicIcon, UsersIcon } from "lucide-react";

export default function AdminPage() {
  const sections = [
    {
      href: "/admin/persona",
      title: "Assistant",
      description: "Définissez le ton, les prompts dynamiques et les modèles Groq utilisés en runtime.",
      icon: UsersIcon,
    },
    {
      href: "/admin/rag",
      title: "Corpus documentaire",
      description: "Importez, éditez et maintenez les documents RAG qui alimentent les réponses métier.",
      icon: BookOpenIcon,
    },
    {
      href: "/admin/voices",
      title: "Voix et consentement",
      description: "Ajoutez des échantillons, contrôlez le consentement et gardez une bibliothèque propre.",
      icon: MicIcon,
    },
  ];

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-border/70 bg-card/70 p-6 shadow-sm md:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/80 px-3 py-1 text-xs text-muted-foreground">
              <BotIcon className="size-3.5" />
              Interface admin simplifiée
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                Un cockpit plus clair, en 3 zones.
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground md:text-base">
                L&apos;ancien empilement de menus a été remplacé par un parcours simple : régler
                l&apos;assistant, maintenir le corpus, puis gérer les voix. Chaque zone correspond
                à une responsabilité précise.
              </p>
            </div>
          </div>

          <div className="grid gap-3 rounded-2xl border border-border bg-background/70 p-4 text-sm text-muted-foreground md:grid-cols-3">
            <div>
              <p className="font-medium text-foreground">1. Assistant</p>
              <p className="mt-1">Ton, prompts et modèle.</p>
            </div>
            <div>
              <p className="font-medium text-foreground">2. Corpus</p>
              <p className="mt-1">Documents importés et éditables.</p>
            </div>
            <div>
              <p className="font-medium text-foreground">3. Voix</p>
              <p className="mt-1">Bibliothèque, écoute et consentement.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {sections.map((section) => (
          <Link
            className="group rounded-3xl border border-border/70 bg-background/80 p-5 transition-all hover:-translate-y-0.5 hover:border-foreground/20 hover:bg-card"
            href={section.href}
            key={section.href}
          >
            <div className="flex size-11 items-center justify-center rounded-2xl border border-border bg-muted text-muted-foreground transition-colors group-hover:text-foreground">
              <section.icon className="size-5" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-foreground">{section.title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{section.description}</p>
            <p className="mt-5 text-sm font-medium text-foreground">Ouvrir la section</p>
          </Link>
        ))}
      </section>

      <section className="rounded-3xl border border-border/70 bg-background/80 p-6">
        <h2 className="text-lg font-semibold text-foreground">Parcours recommandé</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Démarrage</p>
            <p className="mt-2 text-sm font-medium text-foreground">Réglez d&apos;abord la personnalité</p>
            <p className="mt-1 text-sm text-muted-foreground">Définissez le ton et les prompts avant d&apos;alimenter le RAG.</p>
          </div>
          <div className="rounded-2xl border border-border bg-card/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Connaissance</p>
            <p className="mt-2 text-sm font-medium text-foreground">Chargez un corpus propre</p>
            <p className="mt-1 text-sm text-muted-foreground">Importez peu de documents, mais de qualité, puis éditez-les si besoin.</p>
          </div>
          <div className="rounded-2xl border border-border bg-card/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Voix</p>
            <p className="mt-2 text-sm font-medium text-foreground">Finalisez avec les échantillons</p>
            <p className="mt-1 text-sm text-muted-foreground">Ajoutez la voix et vérifiez le consentement avant usage opérationnel.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

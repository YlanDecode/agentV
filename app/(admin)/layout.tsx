import { Suspense } from "react";
import Link from "next/link";
import { BotIcon } from "lucide-react";
import { AdminNav, AdminNavMobile } from "@/components/admin/admin-nav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_40%),linear-gradient(to_bottom,rgba(255,255,255,0.02),transparent_20%)] bg-background">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-4 md:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-2xl border border-border bg-card text-foreground shadow-sm">
                  <BotIcon className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">AgentVOCAL Control Room</p>
                  <p className="text-sm text-muted-foreground">
                    Une console plus simple pour piloter l&apos;assistant, le corpus et les voix.
                  </p>
                </div>
                </div>
                <Suspense fallback={<div className="h-10 w-36 rounded-full bg-card/60" />}>
                  <AdminNavMobile />
                </Suspense>
              </div>

              <Suspense fallback={<div className="hidden h-11 w-full rounded-full bg-card/60 md:block" />}>
                <AdminNav />
              </Suspense>
            </div>

            <div className="flex items-center gap-2 self-start lg:self-end">
              <Link
                href="/"
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
              >
                Retour au chat
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-10">
        {children}
      </main>
    </div>
  );
}

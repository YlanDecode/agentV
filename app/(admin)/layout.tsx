import Link from "next/link";
import { BotIcon } from "lucide-react";
import { AdminNav } from "@/components/admin/admin-nav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="flex w-56 flex-shrink-0 flex-col border-r border-border bg-sidebar">
        <div className="border-b border-border px-4 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-7 items-center justify-center rounded-lg bg-sidebar-accent">
              <BotIcon className="size-4 text-sidebar-accent-foreground" />
            </div>
            <span className="text-sm font-semibold text-sidebar-foreground">POC Control Room</span>
          </div>
          <Link
            href="/"
            className="mt-3 block text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Retour au chat
          </Link>
        </div>
        <AdminNav />
      </aside>

      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}

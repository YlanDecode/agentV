"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BotMessageSquareIcon, BookOpenIcon, MicIcon, UsersIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/admin/persona", label: "Persona & Prompts", icon: UsersIcon },
  { href: "/admin/voices", label: "Voix clonées", icon: MicIcon },
  { href: "/admin/rag", label: "Documents RAG", icon: BookOpenIcon },
  { href: "/admin/knowledge", label: "Base de connaissances", icon: BotMessageSquareIcon },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-0.5 px-2 py-3">
      {NAV_ITEMS.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
            )}
          >
            <item.icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

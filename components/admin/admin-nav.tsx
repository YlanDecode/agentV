"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3Icon, BookOpenIcon, BotIcon, MenuIcon, MicIcon, UsersIcon } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export const ADMIN_NAV_ITEMS = [
  {
    href: "/admin",
    label: "Vue d'ensemble",
    description: "L'espace admin",
    icon: BotIcon,
  },
  {
    href: "/admin/persona",
    label: "Assistant",
    description: "Ton, prompts et modèles",
    icon: UsersIcon,
  },
  {
    href: "/admin/rag",
    label: "Corpus",
    description: "Documents et connaissances",
    icon: BookOpenIcon,
  },
  {
    href: "/admin/voices",
    label: "Voix",
    description: "Échantillons et consentement",
    icon: MicIcon,
  },
  {
    href: "/admin/analytics",
    label: "Analytics",
    description: "KPI temps réel et santé opérationnelle",
    icon: BarChart3Icon,
  },
];

function useActiveItem() {
  const pathname = usePathname();
  const activeItem =
    ADMIN_NAV_ITEMS.find((item) =>
      item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href)
    ) ?? ADMIN_NAV_ITEMS[0];

  return { pathname, activeItem };
}

export function AdminNav() {
  const { pathname } = useActiveItem();

  return (
    <nav className="hidden flex-wrap gap-2 md:flex">
      <div className="flex flex-wrap gap-2">
        {ADMIN_NAV_ITEMS.map((item) => {
          const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm transition-all",
                active
                  ? "border-foreground/20 bg-foreground text-background shadow-sm"
                  : "border-border/70 bg-background/70 text-foreground hover:border-foreground/20 hover:bg-card"
              )}
            >
              <div
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border",
                  active
                    ? "border-white/15 bg-white/10 text-white"
                    : "border-border bg-muted text-muted-foreground group-hover:text-foreground"
                )}
              >
                <item.icon className="size-4" />
              </div>

              <span className={cn("font-medium", active ? "text-white" : "text-foreground")}>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function AdminNavMobile() {
  const { activeItem } = useActiveItem();

  return (
    <div className="md:hidden">
      <Sheet>
        <SheetTrigger asChild>
          <button
            className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-2 text-sm text-foreground"
            type="button"
          >
            <MenuIcon className="size-4" />
            {activeItem.label}
          </button>
        </SheetTrigger>
        <SheetContent side="bottom" className="rounded-t-3xl border-t border-border bg-background/95">
          <SheetHeader className="px-5 pb-2 pt-5">
            <SheetTitle>Sections admin</SheetTitle>
            <SheetDescription>
              Naviguez entre les sections principales sans repasser par plusieurs menus.
            </SheetDescription>
          </SheetHeader>
          <div className="grid gap-2 px-5 pb-6">
            {ADMIN_NAV_ITEMS.map((item) => {
              const active = item.href === activeItem.href;

              return (
                <Link
                  className={cn(
                    "flex items-start gap-3 rounded-2xl border px-4 py-3 transition-colors",
                    active
                      ? "border-foreground/20 bg-foreground text-background"
                      : "border-border bg-card/60 text-foreground"
                  )}
                  href={item.href}
                  key={item.href}
                >
                  <div className={cn(
                    "mt-0.5 flex size-9 items-center justify-center rounded-xl border",
                    active ? "border-white/15 bg-white/10 text-white" : "border-border bg-muted text-muted-foreground"
                  )}>
                    <item.icon className="size-4" />
                  </div>
                  <div>
                    <p className={cn("text-sm font-medium", active ? "text-white" : "text-foreground")}>{item.label}</p>
                    <p className={cn("mt-0.5 text-xs", active ? "text-white/70" : "text-muted-foreground")}>{item.description}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

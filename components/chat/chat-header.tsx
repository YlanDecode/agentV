"use client";

import { BotIcon, PanelLeftIcon } from "lucide-react";
import Link from "next/link";
import { memo } from "react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { VisibilitySelector, type VisibilityType } from "./visibility-selector";

function PureChatHeader({
  chatId,
  selectedVisibilityType,
  isReadonly,
}: {
  chatId: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
}) {
  const { state, toggleSidebar, isMobile } = useSidebar();

  if (state === "collapsed" && !isMobile) {
    return null;
  }

  return (
    <header className="sticky top-0 flex h-14 items-center gap-2 bg-sidebar px-3">
      <Button
        className="md:hidden"
        onClick={toggleSidebar}
        size="icon-sm"
        variant="ghost"
      >
        <PanelLeftIcon className="size-4" />
      </Button>

      <div className="flex items-center gap-2 pl-1 md:hidden">
        <div className="flex size-8 items-center justify-center rounded-lg border border-border/40 bg-background">
          <BotIcon className="size-4" />
        </div>
        <span className="text-sm font-medium">blueAgent</span>
      </div>

      {!isReadonly && (
        <VisibilitySelector
          chatId={chatId}
          selectedVisibilityType={selectedVisibilityType}
        />
      )}

      <Button
        asChild
        className="hidden rounded-lg border border-border/40 px-4 md:ml-auto md:flex"
        variant="ghost"
      >
        <Link href="/settings">POC Config</Link>
      </Button>

      <div className="hidden items-center gap-2 md:flex">
        <div className="flex size-8 items-center justify-center rounded-lg border border-border/40 bg-background">
          <BotIcon className="size-4" />
        </div>
        <span className="text-sm font-medium">blueAgent</span>
      </div>
    </header>
  );
}

export const ChatHeader = memo(PureChatHeader, (prevProps, nextProps) => {
  return (
    prevProps.chatId === nextProps.chatId &&
    prevProps.selectedVisibilityType === nextProps.selectedVisibilityType &&
    prevProps.isReadonly === nextProps.isReadonly
  );
});

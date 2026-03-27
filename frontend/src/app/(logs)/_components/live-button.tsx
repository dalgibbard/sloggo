"use client";

import { HotkeyKbd } from "@/components/custom/hotkey-kbd";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HOTKEYS } from "@/constants/hotkeys";
import { useHotKey } from "@/hooks/use-hot-key";
import { cn } from "@/lib/utils";
import { CirclePause, CirclePlay } from "lucide-react";
import * as React from "react";

interface LiveButtonProps {
  live: boolean;
  onToggle: () => void;
}

export function LiveButton({ live, onToggle }: LiveButtonProps) {
  useHotKey(onToggle, HOTKEYS.toggleLive);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            className={cn(live && "border-info text-info hover:text-info")}
            onClick={onToggle}
            variant="outline"
            size="sm"
          >
            {live ? (
              <CirclePause className="mr-2 h-4 w-4" />
            ) : (
              <CirclePlay className="mr-2 h-4 w-4" />
            )}
            Live
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">
          <p>
            Toggle live mode with
            <HotkeyKbd
              keys={HOTKEYS.toggleLive.keys}
              className="ml-1"
              kbdClassName="text-muted-foreground group-hover:text-accent-foreground"
            />
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

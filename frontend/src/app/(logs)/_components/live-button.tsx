"use client";

import { HotkeyKbd } from "@/components/custom/hotkey-kbd";
import { useDataTable } from "@/components/data-table/data-table-provider";
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
import type { FetchPreviousPageOptions } from "@tanstack/react-query";
import { CirclePause, CirclePlay } from "lucide-react";
import { useQueryStates } from "nuqs";
import * as React from "react";
import { searchParamsParser } from "../search-params";

const REFRESH_INTERVAL = 4_000;

interface LiveButtonProps {
  fetchPreviousPage?: (
    options?: FetchPreviousPageOptions | undefined,
  ) => Promise<unknown>;
}

export function LiveButton({ fetchPreviousPage }: LiveButtonProps) {
  const [{ live, timestamp, sort }, setSearch] =
    useQueryStates(searchParamsParser);
  const { table } = useDataTable();
  useHotKey(handleClick, HOTKEYS.toggleLive);

  React.useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    async function fetchData() {
      if (live) {
        await fetchPreviousPage?.();
        timeoutId = setTimeout(fetchData, REFRESH_INTERVAL);
      } else {
        clearTimeout(timeoutId);
      }
    }

    fetchData();

    return () => {
      clearTimeout(timeoutId);
    };
  }, [live, fetchPreviousPage]);

  // REMINDER: make sure to reset live when date is set
  // TODO: test properly
  React.useEffect(() => {
    if ((timestamp || sort) && live) {
      setSearch((prev) => ({ ...prev, live: null }));
    }
  }, [timestamp, sort, live, setSearch]);

  function handleClick() {
    setSearch((prev) => ({
      ...prev,
      live: !prev.live,
      date: null,
      sort: null,
    }));
    table.getColumn("timestamp")?.setFilterValue(undefined);
    table.resetSorting();
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            className={cn(live && "border-info text-info hover:text-info")}
            onClick={handleClick}
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

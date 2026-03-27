"use client";

import { HotkeyKbd } from "@/components/custom/hotkey-kbd";
import { useDataTable } from "@/components/data-table/data-table-provider";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HOTKEYS } from "@/constants/hotkeys";
import { useHotKey } from "@/hooks/use-hot-key";
import { X } from "lucide-react";
import { Button } from "../ui/button";

export function DataTableResetButton() {
  const { table } = useDataTable();
  useHotKey(() => table.resetColumnFilters(), HOTKEYS.resetFilters);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => table.resetColumnFilters()}
          >
            <X className="mr-2 h-4 w-4" />
            Reset
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">
          <p>
            Reset filters with
            <HotkeyKbd
              keys={HOTKEYS.resetFilters.keys}
              className="ml-1"
              kbdClassName="text-muted-foreground group-hover:text-accent-foreground"
            />
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

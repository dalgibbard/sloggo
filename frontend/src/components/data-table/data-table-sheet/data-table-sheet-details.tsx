"use client";

import { ChevronDown, ChevronUp, X } from "lucide-react";
import * as React from "react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/custom/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Kbd } from "@/components/custom/kbd";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export interface DataTableSheetDetailsProps {
  open: boolean;
  title?: React.ReactNode;
  titleClassName?: string;
  isLoading?: boolean;
  canPrev?: boolean;
  canNext?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  onClose: () => void;
  children?: React.ReactNode;
}

export function DataTableSheetDetails({
  open,
  title,
  titleClassName,
  isLoading,
  canPrev,
  canNext,
  onPrev,
  onNext,
  onClose,
  children,
}: DataTableSheetDetailsProps) {
  React.useEffect(() => {
    if (!open) return;

    const down = (e: KeyboardEvent) => {
      // REMINDER: prevent dropdown navigation inside of sheet to change row selection
      const activeElement = document.activeElement;
      const isMenuActive = activeElement?.closest('[role="menu"]');

      if (isMenuActive) return;

      if (e.key === "ArrowUp" && canPrev) {
        e.preventDefault();
        onPrev?.();
      }

      if (e.key === "ArrowDown" && canNext) {
        e.preventDefault();
        onNext?.();
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [canNext, canPrev, onNext, onPrev, open]);

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      <SheetContent
        className="overflow-y-auto p-0 sm:max-w-md"
        hideClose
      >
        <SheetHeader className="sticky top-0 z-10 border-b bg-background p-4">
          <div className="flex items-center justify-between gap-2">
            <SheetTitle className={cn(titleClassName, "truncate text-left")}>
              {isLoading ? <Skeleton className="h-7 w-36" /> : title}
            </SheetTitle>
            <div className="flex h-7 items-center gap-1">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      disabled={!canPrev}
                      onClick={onPrev}
                    >
                      <ChevronUp className="h-5 w-5" />
                      <span className="sr-only">Previous</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      Navigate <Kbd variant="outline">↑</Kbd>
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      disabled={!canNext}
                      onClick={onNext}
                    >
                      <ChevronDown className="h-5 w-5" />
                      <span className="sr-only">Next</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      Navigate <Kbd variant="outline">↓</Kbd>
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Separator orientation="vertical" className="mx-1" />
              <SheetClose autoFocus={true} asChild>
                <Button size="icon" variant="ghost" className="h-7 w-7">
                  <X className="h-5 w-5" />
                  <span className="sr-only">Close</span>
                </Button>
              </SheetClose>
            </div>
          </div>
        </SheetHeader>
        <SheetDescription className="sr-only">
          Selected row details
        </SheetDescription>
        <div className="p-4">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

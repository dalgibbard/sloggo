import React, { useState, useRef, useEffect } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { TooltipPortal } from "@radix-ui/react-tooltip";
import { DataTableContext } from "@/components/data-table/data-table-provider";

interface TextWithTooltipProps {
  text: string | number;
  className?: string;
}

export function TextWithTooltip({ text, className }: TextWithTooltipProps) {
  const [isTruncated, setIsTruncated] = useState<boolean>(false);
  const textRef = useRef<HTMLDivElement>(null);
  const dataTableContext = React.useContext(DataTableContext);
  const wrapCells = dataTableContext?.wrapCells ?? false;

  useEffect(() => {
    if (wrapCells) {
      setIsTruncated(false);
      return;
    }

    const checkTruncation = () => {
      if (textRef.current) {
        const { scrollWidth, clientWidth } = textRef.current;
        setIsTruncated(scrollWidth > clientWidth);
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      checkTruncation();
    });

    if (textRef.current) {
      resizeObserver.observe(textRef.current);
    }

    checkTruncation();

    return () => {
      resizeObserver.disconnect();
    };
  }, [wrapCells, text]);

  return (
    <TooltipProvider delayDuration={100} disableHoverableContent>
      <Tooltip>
        <TooltipTrigger disabled={wrapCells || !isTruncated} asChild>
          <div
            ref={textRef}
            className={cn(
              wrapCells ? "whitespace-pre-wrap break-words" : "truncate",
              !wrapCells && !isTruncated && "pointer-events-none",
              className
            )}
          >
            {text}
          </div>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent>{text}</TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </TooltipProvider>
  );
}

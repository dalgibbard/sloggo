"use client";

import { cn } from "@/lib/utils";
import * as React from "react";
import { Kbd } from "./kbd";

interface HotkeyKbdProps extends React.HTMLAttributes<HTMLSpanElement> {
  keys: string[];
  kbdClassName?: string;
}

export function HotkeyKbd({
  keys,
  className,
  kbdClassName,
  ...props
}: HotkeyKbdProps) {
  return (
    <span
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    >
      {keys.map((key, index) => (
        <React.Fragment key={`${key}-${index}`}>
          {index > 0 ? <span className="text-muted-foreground">+</span> : null}
          <Kbd className={kbdClassName}>{key}</Kbd>
        </React.Fragment>
      ))}
    </span>
  );
}

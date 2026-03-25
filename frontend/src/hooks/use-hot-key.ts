import type { HotKeyDefinition } from "@/constants/hotkeys";
import { useEffect } from "react";

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;

  const tagName = target.tagName.toLowerCase();
  return (
    target.isContentEditable ||
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select"
  );
}

export function useHotKey(
  callback: () => void,
  hotkey: HotKeyDefinition,
): void {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (!hotkey.allowInInput && isEditableTarget(e.target)) return;

      const keyMatches = hotkey.code
        ? e.code === hotkey.code
        : e.key.toLowerCase() === hotkey.key?.toLowerCase();

      if (!keyMatches) return;
      if (Boolean(hotkey.altKey) !== e.altKey) return;
      if (Boolean(hotkey.shiftKey) !== e.shiftKey) return;
      if (Boolean(hotkey.ctrlKey) !== e.ctrlKey) return;
      if (Boolean(hotkey.metaKey) !== e.metaKey) return;

      if (hotkey.preventDefault ?? true) {
        e.preventDefault();
      }
      callback();
    }

    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, [callback, hotkey]);
}

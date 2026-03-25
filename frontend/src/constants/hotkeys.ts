export type HotKeyDefinition = {
  key?: string;
  code?: string;
  altKey?: boolean;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  preventDefault?: boolean;
  allowInInput?: boolean;
  keys: string[];
  description: string;
};

export const HOTKEYS = {
  toggleCommand: {
    key: "k",
    altKey: true,
    shiftKey: true,
    preventDefault: true,
    keys: ["Alt", "Shift", "K"],
    description: "Toggle command input",
  },
  toggleControls: {
    key: "b",
    altKey: true,
    shiftKey: true,
    preventDefault: true,
    keys: ["Alt", "Shift", "B"],
    description: "Toggle sidebar controls",
  },
  resetColumns: {
    key: "u",
    altKey: true,
    shiftKey: true,
    preventDefault: true,
    keys: ["Alt", "Shift", "U"],
    description: "Reset column state (order, visibility)",
  },
  toggleLive: {
    key: "j",
    altKey: true,
    shiftKey: true,
    preventDefault: true,
    keys: ["Alt", "Shift", "J"],
    description: "Toggle live mode",
  },
  resetFilters: {
    key: "r",
    altKey: true,
    shiftKey: true,
    preventDefault: true,
    keys: ["Alt", "Shift", "R"],
    description: "Reset table filters",
  },
  resetFocus: {
    code: "Period",
    altKey: true,
    shiftKey: true,
    preventDefault: true,
    keys: ["Alt", "Shift", "."],
    description: "Reset element focus to start",
  },
} satisfies Record<string, HotKeyDefinition>;

export const HOTKEY_OVERVIEW = [
  HOTKEYS.toggleCommand,
  HOTKEYS.toggleControls,
  HOTKEYS.resetColumns,
  HOTKEYS.toggleLive,
  HOTKEYS.resetFilters,
  HOTKEYS.resetFocus,
];

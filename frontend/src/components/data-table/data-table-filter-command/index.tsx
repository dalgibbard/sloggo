"use client";

import { HotkeyKbd } from "@/components/custom/hotkey-kbd";
import { Kbd } from "@/components/custom/kbd";
import { useDataTable } from "@/components/data-table/data-table-provider";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Separator } from "@/components/ui/separator";
import { HOTKEYS } from "@/constants/hotkeys";
import { useHotKey } from "@/hooks/use-hot-key";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { formatCompactNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { LoaderCircle, Search, X } from "lucide-react";
import { ParserBuilder } from "nuqs";
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { DataTableFilterField } from "../types";
import {
  columnFiltersParser,
  getFieldOptions,
  getFilterValue,
  getWordByCaretPosition,
  isCommandInputReady,
  replaceInputByFieldType,
} from "./utils";

// FIXME: there is an issue on cmdk if I wanna only set a single slider value...

interface DataTableFilterCommandProps {
  // TODO: maybe use generics for the parser
  searchParamsParser: Record<string, ParserBuilder<any>>;
}

export function DataTableFilterCommand({
  searchParamsParser,
}: DataTableFilterCommandProps) {
  const {
    table,
    isLoading,
    filterFields: _filterFields,
    getFacetedUniqueValues,
  } = useDataTable();
  const columnFilters = table.getState().columnFilters;
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState<boolean>(false);
  const [currentWord, setCurrentWord] = useState<string>("");
  const filterFields = useMemo(
    () => _filterFields?.filter((i) => !i.commandDisabled),
    [_filterFields],
  );
  const columnParser = useMemo(
    () => columnFiltersParser({ searchParamsParser, filterFields }),
    [searchParamsParser, filterFields],
  );
  const [inputValue, setInputValue] = useState<string>(
    columnParser.serialize(columnFilters),
  );
  const [suggestionNavigationActive, setSuggestionNavigationActive] =
    useState(false);
  const [lastSearches, setLastSearches] = useLocalStorage<
    {
      search: string;
      timestamp: number;
    }[]
  >("data-table-command", []);
  const blurActionRef = useRef<"commit" | "cancel" | null>(null);
  const readyToCommit = useMemo(
    () => isCommandInputReady({ inputValue, filterFields }),
    [inputValue, filterFields],
  );
  const showMenu = open && !readyToCommit;
  const commandItemClassName = suggestionNavigationActive
    ? undefined
    : "data-[selected=true]:bg-transparent data-[selected=true]:text-foreground";

  const applyInputValue = React.useCallback(
    (value: string) => {
      const searchParams = columnParser.parse(value);
      const currentFilters = table.getState().columnFilters;
      const currentEnabledFilters = currentFilters.filter((filter) => {
        const field = _filterFields?.find((field) => field.value === filter.id);
        return (
          !field?.commandDisabled ||
          filter.id === "msgField" ||
          filter.id === "cefExt"
        );
      });
      const unmanagedFilters = currentFilters.filter((filter) => {
        return !currentEnabledFilters.some(
          (enabledFilter) => enabledFilter.id === filter.id,
        );
      });
      const nextEnabledFilters = Object.entries(searchParams).flatMap(
        ([id, nextValue]) => {
          if (nextValue == null) return [];
          return [{ id, value: nextValue }];
        },
      );
      const nextFilters = [...unmanagedFilters, ...nextEnabledFilters];

      if (areColumnFiltersEqual(currentFilters, nextFilters)) {
        return false;
      }

      table.setColumnFilters(nextFilters);
      return true;
    },
    [_filterFields, columnParser, table],
  );

  const rememberSearch = React.useCallback(
    (value: string) => {
      const search = value.trim();
      if (!search) return;

      const timestamp = Date.now();
      setLastSearches((current) => {
        const searchIndex = current.findIndex((item) => item.search === search);
        if (searchIndex !== -1) {
          return current.map((item, index) =>
            index === searchIndex ? { ...item, timestamp } : item,
          );
        }

        return [...current, { search, timestamp }];
      });
    },
    [setLastSearches],
  );

  const resetInputValue = React.useCallback(() => {
    setInputValue(columnParser.serialize(columnFilters));
    setCurrentWord("");
    setSuggestionNavigationActive(false);
  }, [columnFilters, columnParser]);

  const clearInputValue = React.useCallback(() => {
    applyInputValue("");
    setInputValue("");
    setCurrentWord("");
    setSuggestionNavigationActive(false);
  }, [applyInputValue]);

  const commitInputValue = React.useCallback(() => {
    const trimmedInput = inputValue.trim();
    if (!trimmedInput) {
      clearInputValue();
      return true;
    }

    if (!readyToCommit) {
      return false;
    }

    applyInputValue(trimmedInput);
    rememberSearch(trimmedInput);
    setInputValue(trimmedInput);
    setCurrentWord("");
    setSuggestionNavigationActive(false);
    return true;
  }, [
    applyInputValue,
    clearInputValue,
    inputValue,
    readyToCommit,
    rememberSearch,
  ]);

  useEffect(() => {
    if (open) return;

    setCurrentWord("");
    setSuggestionNavigationActive(false);
    const nextInputValue = columnParser.serialize(columnFilters);
    if (nextInputValue !== inputValue) {
      setInputValue(nextInputValue);
    }
  }, [columnFilters, columnParser, inputValue, open]);

  useHotKey(() => setOpen((open) => !open), HOTKEYS.toggleCommand);

  useEffect(() => {
    if (open) {
      inputRef?.current?.focus();
    }
  }, [open]);

  return (
    <div>
      <button
        type="button"
        className={cn(
          "group flex w-full items-center rounded-lg border border-input bg-background px-3 text-muted-foreground ring-offset-background focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 hover:bg-accent/50 hover:text-accent-foreground",
          open ? "hidden" : "visible",
        )}
        onClick={() => setOpen(true)}
      >
        {isLoading ? (
          <LoaderCircle className="mr-2 h-4 w-4 shrink-0 animate-spin text-muted-foreground opacity-50 group-hover:text-popover-foreground" />
        ) : (
          <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground opacity-50 group-hover:text-popover-foreground" />
        )}
        <span className="h-11 w-full max-w-sm truncate py-3 text-left text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50 md:max-w-xl lg:max-w-4xl xl:max-w-5xl">
          {inputValue.trim() ? (
            <span className="text-foreground">{inputValue}</span>
          ) : (
            <span>Search data table...</span>
          )}
        </span>
        <HotkeyKbd
          keys={HOTKEYS.toggleCommand.keys}
          className="ml-auto"
          kbdClassName="text-muted-foreground group-hover:text-accent-foreground"
        />
      </button>
      <Command
        className={cn(
          "overflow-visible rounded-lg border border-border shadow-md dark:bg-muted/50 [&>div]:border-none",
          open ? "visible" : "hidden",
        )}
        filter={(value, search, keywords) =>
          getFilterValue({ value, search, keywords, currentWord })
        }
        // loop
      >
        <CommandInput
          ref={inputRef}
          value={inputValue}
          onValueChange={(nextValue) => {
            setInputValue(nextValue);
            setSuggestionNavigationActive(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              setSuggestionNavigationActive(true);
              return;
            }

            if (e.key === "Enter" && !suggestionNavigationActive) {
              e.preventDefault();
              e.stopPropagation();
              if (commitInputValue()) {
                blurActionRef.current = "commit";
                setOpen(false);
                e.currentTarget.blur();
              }
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              blurActionRef.current = "cancel";
              resetInputValue();
              setOpen(false);
              e.currentTarget.blur();
            }
          }}
          onBlur={() => {
            const blurAction = blurActionRef.current;
            blurActionRef.current = null;
            setOpen(false);

            if (blurAction === "cancel") {
              return;
            }

            if (blurAction === "commit") {
              return;
            }

            if (readyToCommit) {
              commitInputValue();
              return;
            }

            resetInputValue();
          }}
          onInput={(e) => {
            const caretPosition = e.currentTarget?.selectionStart || -1;
            const value = e.currentTarget?.value || "";
            const word = getWordByCaretPosition({ value, caretPosition });
            setCurrentWord(word);
          }}
          placeholder="Search data table..."
          className="text-foreground"
        />
        {showMenu ? (
          <div className="relative">
            <div className="absolute top-2 z-10 w-full overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-md outline-none animate-in">
              {/* default height is 300px but in case of more, we'd like to tease the user */}
              <CommandList className="max-h-[310px]">
                <CommandGroup heading="Filter">
                  {filterFields.map((field) => {
                    if (typeof field.value !== "string") return null;
                    if (
                      field.type !== "input" &&
                      (inputValue.includes(`${field.value}:`) ||
                        inputValue.includes(`${field.value}=`))
                    ) {
                      return null;
                    }
                    // TBD: should we handle this in the component?
                    return (
                      <CommandItem
                        key={field.value}
                        value={field.value}
                        className={cn("group", commandItemClassName)}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onSelect={(value) => {
                          setInputValue((prev) => {
                            const isNegatedField = currentWord.startsWith("!");
                            const normalizedValue = isNegatedField
                              ? `!${value}`
                              : value;
                            if (currentWord.trim() === "") {
                              const input = `${prev}${normalizedValue}`;
                              return `${input}:`;
                            }
                            // lots of cheat
                            const isStarting = currentWord === prev;
                            const prefix = isStarting ? "" : " ";
                            const input = prev.replace(
                              `${prefix}${currentWord}`,
                              `${prefix}${normalizedValue}`,
                            );
                            return `${input}:`;
                          });
                          setCurrentWord(
                            `${currentWord.startsWith("!") ? "!" : ""}${value}:`,
                          );
                        }}
                      >
                        {field.value}
                        <CommandItemSuggestions
                          field={field}
                          engaged={suggestionNavigationActive}
                        />
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
                <CommandSeparator />
                <CommandGroup heading="Query">
                  {filterFields?.map((field) => {
                    if (typeof field.value !== "string") return null;
                    if (
                      !currentWord.includes(`${field.value}:`) &&
                      !currentWord.includes(`${field.value}=`)
                    ) {
                      return null;
                    }

                    const column = table.getColumn(field.value);
                    const facetedValue =
                      getFacetedUniqueValues?.(table, field.value) ||
                      column?.getFacetedUniqueValues();

                    const options = getFieldOptions({ field });

                    return options.map((optionValue) => {
                      return (
                        <CommandItem
                          key={`${String(field.value)}:${optionValue}`}
                          value={`${String(field.value)}:${optionValue}`}
                          className={commandItemClassName}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          onSelect={(value) => {
                            setInputValue((prev) =>
                              replaceInputByFieldType({
                                prev,
                                currentWord,
                                optionValue,
                                value,
                                field,
                              }),
                            );
                            setCurrentWord("");
                          }}
                        >
                          {`${optionValue}`}
                          {facetedValue?.has(optionValue) ? (
                            <span className="ml-auto font-mono text-muted-foreground">
                              {formatCompactNumber(
                                facetedValue.get(optionValue) || 0,
                              )}
                            </span>
                          ) : null}
                        </CommandItem>
                      );
                    });
                  })}
                </CommandGroup>
                <CommandSeparator />
                <CommandGroup heading="Suggestions">
                  {lastSearches
                    ?.sort((a, b) => b.timestamp - a.timestamp)
                    .slice(0, 5)
                    .map((item) => {
                      return (
                        <CommandItem
                          key={`suggestion:${item.search}`}
                          value={`suggestion:${item.search}`}
                          className={cn("group", commandItemClassName)}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          onSelect={(value) => {
                            const search = value.replace("suggestion:", "");
                            setInputValue(`${search} `);
                            setCurrentWord("");
                          }}
                        >
                          {item.search}
                          <span
                            className={cn(
                              "ml-auto truncate text-muted-foreground/80",
                              suggestionNavigationActive ? "group-aria-[selected=true]:block" : "hidden",
                            )}
                          >
                            {formatDistanceToNow(item.timestamp, {
                              addSuffix: true,
                            })}
                          </span>
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setLastSearches(
                                lastSearches.filter(
                                  (i) => i.search !== item.search,
                                ),
                              );
                            }}
                            className={cn(
                              "ml-1 rounded-md p-0.5 hover:bg-background",
                              suggestionNavigationActive ? "hidden group-aria-[selected=true]:block" : "hidden",
                            )}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </CommandItem>
                      );
                    })}
                </CommandGroup>
                <CommandEmpty>No results found.</CommandEmpty>
              </CommandList>
              <div
                className="flex flex-wrap justify-between gap-3 border-t bg-accent/50 px-2 py-1.5 text-sm text-accent-foreground"
                cmdk-footer=""
              >
                <div className="flex flex-wrap gap-3">
                  <span>
                    Use <Kbd variant="outline">↑</Kbd>{" "}
                    <Kbd variant="outline">↓</Kbd> to navigate
                  </span>
                  <span>
                    <Kbd variant="outline">Enter</Kbd> to query
                  </span>
                  <span>
                    <Kbd variant="outline">Esc</Kbd> to close
                  </span>
                  <Separator orientation="vertical" className="my-auto h-3" />
                  <span>
                    Union: <Kbd variant="outline">regions:a,b</Kbd>
                  </span>
                  <span>
                    Range: <Kbd variant="outline">p95:59-340</Kbd>
                  </span>
                  <span>
                    Exclude: <Kbd variant="outline">!hostname:router</Kbd>
                  </span>
                  <span>
                    Exclude: <Kbd variant="outline">NOT hostname:router</Kbd>
                  </span>
                  <span>
                    Phrase:{" "}
                    <Kbd variant="outline">
                      message:&quot;flow not found&quot;
                    </Kbd>
                  </span>
                  <span>
                    JSON:{" "}
                    <Kbd variant="outline">
                      message.type:&quot;dnsAdBlock&quot;
                    </Kbd>
                  </span>
                </div>
                {lastSearches.length ? (
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-accent-foreground"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={() => setLastSearches([])}
                  >
                    Clear suggestions
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </Command>
    </div>
  );
}

function areFilterValuesEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;

  if (left instanceof Date && right instanceof Date) {
    return left.getTime() === right.getTime();
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false;

    return left.every((item, index) =>
      areFilterValuesEqual(item, right[index]),
    );
  }

  if (isStringRecord(left) && isStringRecord(right)) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();

    if (leftKeys.length !== rightKeys.length) return false;

    return leftKeys.every(
      (key, index) =>
        key === rightKeys[index] && left[key] === right[key],
    );
  }

  return false;
}

function areColumnFiltersEqual(
  left: Array<{ id: string; value: unknown }>,
  right: Array<{ id: string; value: unknown }>,
) {
  if (left.length !== right.length) return false;

  return left.every((filter, index) => {
    const nextFilter = right[index];
    if (!nextFilter) return false;

    return (
      filter.id === nextFilter.id &&
      areFilterValuesEqual(filter.value, nextFilter.value)
    );
  });
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((entry) => typeof entry === "string");
}

// function CommandItemType<TData>

function CommandItemSuggestions<TData>({
  field,
  engaged,
}: {
  field: DataTableFilterField<TData>;
  engaged: boolean;
}) {
  const { table, getFacetedMinMaxValues, getFacetedUniqueValues } =
    useDataTable();
  const value = field.value as string;
  switch (field.type) {
    case "checkbox": {
      return (
        <span
          className={cn(
            "ml-1 truncate text-muted-foreground/80",
            engaged ? "hidden group-aria-[selected=true]:block" : "hidden",
          )}
        >
          {getFacetedUniqueValues
            ? Array.from(getFacetedUniqueValues(table, value)?.keys() || [])
                .map((value) => `[${value}]`)
                .join(" ")
            : field.options?.map(({ value }) => `[${value}]`).join(" ")}
        </span>
      );
    }
    case "slider": {
      const [min, max] = getFacetedMinMaxValues?.(table, value) || [
        field.min,
        field.max,
      ];
      return (
        <span
          className={cn(
            "ml-1 truncate text-muted-foreground/80",
            engaged ? "hidden group-aria-[selected=true]:block" : "hidden",
          )}
        >
          [{min} - {max}]
        </span>
      );
    }
    case "input": {
      return (
        <span
          className={cn(
            "ml-1 truncate text-muted-foreground/80",
            engaged ? "hidden group-aria-[selected=true]:block" : "hidden",
          )}
        >
          [{`${String(field.value)}`} input]
        </span>
      );
    }
    default: {
      return null;
    }
  }
}

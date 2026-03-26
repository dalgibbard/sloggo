"use client";

import { InputWithAddons } from "@/components/custom/input-with-addons";
import { useDataTable } from "@/components/data-table/data-table-provider";
import { Label } from "@/components/ui/label";
import { useDebounce } from "@/hooks/use-debounce";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import type { DataTableInputFilterField } from "./types";

function getFilter(filterValue: unknown) {
  return typeof filterValue === "string" ? filterValue : null;
}

export function DataTableFilterInput<TData>({
  value: _value,
  placeholder,
  parseInput,
  serializeInput,
}: DataTableInputFilterField<TData>) {
  const value = _value as string;
  const { table, columnFilters } = useDataTable();
  const column = table.getColumn(value);
  const filterValue = columnFilters.find((i) => i.id === value)?.value;
  const filters = serializeInput?.(filterValue) ?? getFilter(filterValue) ?? "";
  const [input, setInput] = useState<string | null>(filters);
  const [isFocused, setIsFocused] = useState(false);

  const debouncedInput = useDebounce(input, 500);

  useEffect(() => {
    const newValue = parseInput
      ? parseInput(debouncedInput || "")
      : debouncedInput?.trim() === ""
        ? null
        : debouncedInput;
    if (debouncedInput === null) return;
    if (
      parseInput &&
      (debouncedInput || "").trim() !== "" &&
      (newValue === null || typeof newValue === "undefined")
    ) {
      return;
    }
    column?.setFilterValue(newValue ?? undefined);
  }, [column, debouncedInput, parseInput]);

  useEffect(() => {
    if (isFocused) return;
    if ((debouncedInput ?? "") !== filters) {
      setInput(filters);
    }
  }, [debouncedInput, filters, isFocused]);

  return (
    <div className="grid w-full gap-1.5">
      <Label htmlFor={value} className="sr-only px-2 text-muted-foreground">
        {value}
      </Label>
      <InputWithAddons
        placeholder={placeholder || "Search"}
        leading={<Search className="mt-0.5 h-4 w-4" />}
        containerClassName="h-9 rounded-lg"
        name={value}
        id={value}
        value={input || ""}
        onChange={(e) => setInput(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
      />
    </div>
  );
}

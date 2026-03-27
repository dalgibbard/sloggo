"use client";

import { InputWithAddons } from "@/components/custom/input-with-addons";
import { useDataTable } from "@/components/data-table/data-table-provider";
import { Label } from "@/components/ui/label";
import { useDebounce } from "@/hooks/use-debounce";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import type { DataTableInputFilterField } from "./types";

function getFilter(filterValue: unknown) {
  if (typeof filterValue === "string") {
    return filterValue;
  }

  if (Array.isArray(filterValue)) {
    const values = filterValue.filter(
      (value): value is string => typeof value === "string",
    );
    return values.join("; ");
  }

  return null;
}

function parseFilter(input: string) {
  const values = input
    .split(";")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (values.length === 0) return null;
  if (values.length === 1) return values[0];
  return values;
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
    if (!isFocused && (debouncedInput ?? "") !== filters) {
      return;
    }

    const newValue = parseInput
      ? parseInput(debouncedInput || "")
      : debouncedInput?.trim() === ""
        ? null
        : parseFilter(debouncedInput ?? "");
    if (debouncedInput === null) return;
    if (
      parseInput &&
      (debouncedInput || "").trim() !== "" &&
      (newValue === null || typeof newValue === "undefined")
    ) {
      return;
    }

    if (areFilterValuesEqual(filterValue, newValue ?? undefined)) {
      return;
    }

    column?.setFilterValue(newValue ?? undefined);
  }, [column, debouncedInput, filterValue, filters, isFocused, parseInput]);

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

function areFilterValuesEqual(left: unknown, right: unknown): boolean {
  if (left == null && right == null) return true;
  if (left === right) return true;

  if (left instanceof Date && right instanceof Date) {
    return left.getTime() === right.getTime();
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false;

    return left.every((value, index) =>
      areFilterValuesEqual(value, right[index]),
    );
  }

  if (isPlainRecord(left) && isPlainRecord(right)) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();

    if (leftKeys.length !== rightKeys.length) return false;

    return leftKeys.every(
      (key, index) =>
        key === rightKeys[index] &&
        areFilterValuesEqual(left[key], right[key]),
    );
  }

  return false;
}

function isPlainRecord(
  value: unknown,
): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

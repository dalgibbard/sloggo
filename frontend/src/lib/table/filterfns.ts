import { FilterFn } from "@tanstack/react-table";
import { isAfter, isBefore, isSameDay } from "date-fns";
import { isArrayOfDates } from "../is-array";

export const inDateRange: FilterFn<any> = (row, columnId, value) => {
  const date = new Date(row.getValue(columnId));
  const [start, end] = value as Date[];

  if (isNaN(date.getTime())) return false;

  // if no end date, check if it's the same day
  if (!end) return isSameDay(date, start);

  return isAfter(date, start) && isBefore(date, end);
};

inDateRange.autoRemove = (val: any) =>
  !Array.isArray(val) || !val.length || !isArrayOfDates(val);

export const arrSome: FilterFn<any> = (row, columnId, filterValue) => {
  if (!Array.isArray(filterValue)) return false;
  return filterValue.some((val) => row.getValue<unknown[]>(columnId) === val);
};

arrSome.autoRemove = (val: any) => !Array.isArray(val) || !val?.length;

export const matchStringFilter: FilterFn<any> = (
  row,
  columnId,
  filterValue,
) => {
  if (
    (typeof filterValue !== "string" && !Array.isArray(filterValue)) ||
    (typeof filterValue === "string" && filterValue.length === 0) ||
    (Array.isArray(filterValue) && filterValue.length === 0)
  ) {
    return true;
  }

  const rowValue = row.getValue<string | null | undefined>(columnId);
  const normalizedRowValue = rowValue ?? "";
  const filterValues = normalizeStringFilterValues(filterValue);
  if (filterValues.length === 0) {
    return true;
  }

  const includedValues = filterValues.filter((value) => !value.startsWith("!"));
  const excludedValues = filterValues
    .filter((value) => value.startsWith("!"))
    .map((value) => value.slice(1).trim())
    .filter((value) => value.length > 0);

  if (
    excludedValues.some((value) =>
      matchesStringValue(normalizedRowValue, value, columnId),
    )
  ) {
    return false;
  }

  if (includedValues.length === 0) {
    return true;
  }

  return includedValues.some((value) =>
    matchesStringValue(normalizedRowValue, value, columnId),
  );
};

matchStringFilter.autoRemove = (val: any) =>
  (typeof val !== "string" && !Array.isArray(val)) ||
  normalizeStringFilterValues(val).length === 0;

export const matchCEFExtensions: FilterFn<any> = (
  row,
  columnId,
  filterValue,
) => {
  if (
    !filterValue ||
    typeof filterValue !== "object" ||
    Array.isArray(filterValue)
  ) {
    return true;
  }

  const rowValue = row.getValue<Record<string, string> | undefined>(columnId);
  if (!rowValue) {
    return Object.entries(filterValue).every(([, value]) => {
      return typeof value === "string" && value.startsWith("!");
    });
  }

  return Object.entries(filterValue).every(([key, value]) => {
    if (typeof value !== "string") return false;

    const rowEntry = rowValue[key] ?? "";
    if (value.startsWith("!")) {
      return !matchesMapValue(rowEntry, value.slice(1));
    }

    return matchesMapValue(rowEntry, value);
  });
};

matchCEFExtensions.autoRemove = (val: any) =>
  !val ||
  typeof val !== "object" ||
  Array.isArray(val) ||
  Object.keys(val).length === 0;

function matchesStringValue(
  rowValue: string,
  filterValue: string,
  columnId: string,
) {
  if (filterValue.includes("*")) {
    return wildcardToRegExp(filterValue).test(rowValue);
  }

  if (columnId === "message") {
    return rowValue.toLowerCase().includes(filterValue.toLowerCase());
  }

  return rowValue === filterValue;
}

function wildcardToRegExp(value: string) {
  const escaped = value.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = escaped.replaceAll("\\*", ".*");
  return new RegExp(`^${pattern}$`, "i");
}

function matchesMapValue(rowValue: string, filterValue: string) {
  if (filterValue.includes("*")) {
    return wildcardToRegExp(filterValue).test(rowValue);
  }

  return rowValue === filterValue;
}

function normalizeStringFilterValues(value: unknown): string[] {
  if (typeof value === "string") {
    const normalizedValue = value.trim();
    return normalizedValue && normalizedValue !== "!" ? [normalizedValue] : [];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && entry !== "!");
}

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
  if (typeof filterValue !== "string" || filterValue.length === 0) {
    return true;
  }

  const rowValue = row.getValue<string | null | undefined>(columnId);

  if (filterValue.startsWith("!")) {
    const excludedValue = filterValue.slice(1);
    if (!excludedValue) return true;
    return rowValue !== excludedValue;
  }

  return rowValue === filterValue;
};

matchStringFilter.autoRemove = (val: any) =>
  typeof val !== "string" || val.length === 0 || val === "!";

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
  if (!rowValue) return false;

  return Object.entries(filterValue).every(([key, value]) => {
    return rowValue[key] === value;
  });
};

matchCEFExtensions.autoRemove = (val: any) =>
  !val ||
  typeof val !== "object" ||
  Array.isArray(val) ||
  Object.keys(val).length === 0;

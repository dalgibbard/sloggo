"use client";

import * as React from "react";
import {
  functionalUpdate,
  type ColumnFiltersState,
  type SortingState,
  type Updater,
} from "@tanstack/react-table";
import { useQueryStates } from "nuqs";
import { searchParamsParser, type SearchParamsType } from "./search-params";

interface UseLogsTableStateOptions {
  activeFilterFieldIDs: string[];
  activeColumnIDs: string[];
}

interface LogsTableState {
  search: SearchParamsType;
  columnFilters: ColumnFiltersState;
  sorting: SortingState;
  live: boolean;
  liveAnchorTimestamp?: number;
  selectedRowId: string | null;
  setColumnFilters: (updater: Updater<ColumnFiltersState>) => void;
  setSorting: (updater: Updater<SortingState>) => void;
  toggleLive: () => void;
  selectRow: (rowId: string | null) => void;
  closeRow: () => void;
  resetFilters: () => void;
}

export function useLogsTableState({
  activeFilterFieldIDs,
  activeColumnIDs,
}: UseLogsTableStateOptions): LogsTableState {
  const [search, setSearch] = useQueryStates(searchParamsParser);
  const [selectedRowId, setSelectedRowId] = React.useState<string | null>(null);
  const [liveAnchorTimestamp, setLiveAnchorTimestamp] = React.useState<
    number | undefined
  >(() => (search.live ? Date.now() : undefined));

  const activeFilterFieldSet = React.useMemo(
    () => new Set(activeFilterFieldIDs),
    [activeFilterFieldIDs],
  );
  const activeColumnSet = React.useMemo(
    () => new Set(activeColumnIDs),
    [activeColumnIDs],
  );

  const columnFilters = React.useMemo(
    () =>
      activeFilterFieldIDs.flatMap((key) => {
        const value = search[key as keyof SearchParamsType];
        if (value == null) return [];
        return [{ id: key, value }];
      }),
    [activeFilterFieldIDs, search],
  );

  const sorting = React.useMemo(() => {
    if (!search.sort || !activeColumnSet.has(search.sort.id)) {
      return [] satisfies SortingState;
    }

    return [search.sort] satisfies SortingState;
  }, [activeColumnSet, search.sort]);

  const setColumnFilters = React.useCallback(
    (updater: Updater<ColumnFiltersState>) => {
      const nextColumnFilters = functionalUpdate(updater, columnFilters).filter(
        (filter) => activeFilterFieldSet.has(String(filter.id)),
      );

      if (areColumnFiltersEqual(columnFilters, nextColumnFilters)) {
        return;
      }

      const nextSearch = activeFilterFieldIDs.reduce(
        (prev, key) => {
          prev[key] = null;
          return prev;
        },
        {} as Record<string, unknown>,
      );

      for (const filter of nextColumnFilters) {
        nextSearch[filter.id] = filter.value;
      }

      if (
        search.live &&
        nextColumnFilters.some((filter) => filter.id === "timestamp")
      ) {
        nextSearch.live = null;
      }

      void setSearch(nextSearch);
    },
    [
      activeFilterFieldIDs,
      activeFilterFieldSet,
      columnFilters,
      search.live,
      setSearch,
    ],
  );

  const setSorting = React.useCallback(
    (updater: Updater<SortingState>) => {
      const nextSorting = functionalUpdate(updater, sorting);

      if (areSortingStatesEqual(sorting, nextSorting)) {
        return;
      }

      const nextSort = nextSorting[0] ?? null;
      void setSearch({
        sort: nextSort,
        live: search.live && nextSort ? null : undefined,
      });
    },
    [search.live, setSearch, sorting],
  );

  const toggleLive = React.useCallback(() => {
    const nextLive = !search.live;
    setLiveAnchorTimestamp(nextLive ? Date.now() : undefined);
    void setSearch({
      live: nextLive,
      timestamp: null,
      sort: null,
    });
  }, [search.live, setSearch]);

  const selectRow = React.useCallback((rowId: string | null) => {
    setSelectedRowId((current) => (current === rowId ? current : rowId));
  }, []);

  const closeRow = React.useCallback(() => {
    setSelectedRowId(null);
  }, []);

  const resetFilters = React.useCallback(() => {
    const nextSearch = activeFilterFieldIDs.reduce(
      (prev, key) => {
        prev[key] = null;
        return prev;
      },
      {} as Record<string, unknown>,
    );
    void setSearch(nextSearch);
  }, [activeFilterFieldIDs, setSearch]);

  React.useEffect(() => {
    if (search.live) {
      if (!liveAnchorTimestamp) {
        setLiveAnchorTimestamp(Date.now());
      }
      return;
    }

    if (liveAnchorTimestamp !== undefined) {
      setLiveAnchorTimestamp(undefined);
    }
  }, [liveAnchorTimestamp, search.live]);

  React.useEffect(() => {
    if (search.live && (search.sort || search.timestamp)) {
      void setSearch({ live: null });
    }
  }, [search.live, search.sort, search.timestamp, setSearch]);

  React.useEffect(() => {
    if (search.sort && !activeColumnSet.has(search.sort.id)) {
      void setSearch({ sort: null });
    }
  }, [activeColumnSet, search.sort, setSearch]);

  return {
    search,
    columnFilters,
    sorting,
    live: search.live,
    liveAnchorTimestamp,
    selectedRowId,
    setColumnFilters,
    setSorting,
    toggleLive,
    selectRow,
    closeRow,
    resetFilters,
  };
}

function areColumnFiltersEqual(
  left: ColumnFiltersState,
  right: ColumnFiltersState,
) {
  if (left.length !== right.length) return false;

  return left.every((filter, index) => {
    const nextFilter = right[index];
    if (!nextFilter) return false;

    return (
      filter.id === nextFilter.id &&
      areQueryValuesEqual(filter.value, nextFilter.value)
    );
  });
}

function areSortingStatesEqual(left: SortingState, right: SortingState) {
  if (left.length !== right.length) return false;

  return left.every((value, index) => {
    const nextValue = right[index];
    if (!nextValue) return false;

    return value.id === nextValue.id && value.desc === nextValue.desc;
  });
}

function areStringArraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) return false;

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

function areQueryValuesEqual(left: unknown, right: unknown): boolean {
  if (left == null && right == null) return true;
  if (left === right) return true;

  if (left instanceof Date && right instanceof Date) {
    return left.getTime() === right.getTime();
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false;

    return left.every((value, index) =>
      areQueryValuesEqual(value, right[index]),
    );
  }

  if (isPlainRecord(left) && isPlainRecord(right)) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();

    if (!areStringArraysEqual(leftKeys, rightKeys)) return false;

    return leftKeys.every((key) =>
      areQueryValuesEqual(left[key], right[key]),
    );
  }

  return false;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

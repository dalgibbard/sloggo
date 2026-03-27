"use client";

import { HOTKEYS } from "@/constants/hotkeys";
import { SEVERITY_VALUES } from "@/constants/severity";
import { useHotKey } from "@/hooks/use-hot-key";
import { getSeverityRowClassName } from "@/lib/request/severity";
import { cn } from "@/lib/utils";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { ColumnDef, Table as TTable } from "@tanstack/react-table";
import * as React from "react";
import { LiveButton } from "./_components/live-button";
import { LiveRow } from "./_components/live-row";
import { RefreshButton } from "./_components/refresh-button";
import { CEF_COLUMN_IDS, columns } from "./columns";
import {
  CEF_FILTER_FIELD_IDS,
  CEF_SHEET_FIELD_IDS,
  filterFields as defaultFilterFields,
  sheetFields,
} from "./constants";
import { DataTableInfinite } from "./data-table-infinite";
import { dataOptions, type LogsMeta } from "./query-options";
import type { FacetMetadataSchema } from "./schema";
import { searchParamsParser } from "./search-params";
import { useLogsTableState } from "./use-logs-table-state";

const LIVE_REFRESH_INTERVAL = 4_000;

export function Client() {
  const cefColumnIDs = React.useMemo(
    () => new Set<string>(CEF_COLUMN_IDS),
    [],
  );
  const cefFilterFieldIDs = React.useMemo(
    () => new Set<string>(CEF_FILTER_FIELD_IDS),
    [],
  );
  const cefSheetFieldIDs = React.useMemo(
    () => new Set<string>(CEF_SHEET_FIELD_IDS),
    [],
  );

  const [cefEnabled, setCefEnabled] = React.useState(false);

  const activeColumns = React.useMemo(
    () =>
      columns.filter((column, index) => {
        if (cefEnabled) return true;
        return !cefColumnIDs.has(getColumnDefID(column, index));
      }),
    [cefColumnIDs, cefEnabled],
  );

  const activeColumnIDs = React.useMemo(
    () => activeColumns.map((column, index) => getColumnDefID(column, index)),
    [activeColumns],
  );

  const activeFilterFieldIDs = React.useMemo(
    () =>
      defaultFilterFields
        .filter(
          (field) =>
            cefEnabled || !cefFilterFieldIDs.has(String(field.value)),
        )
        .map((field) => String(field.value)),
    [cefEnabled, cefFilterFieldIDs],
  );

  const tableState = useLogsTableState({
    activeFilterFieldIDs,
    activeColumnIDs,
  });

  const {
    data,
    isFetching,
    isLoading,
    fetchNextPage,
    hasNextPage,
    fetchPreviousPage,
    refetch,
  } = useInfiniteQuery(dataOptions(tableState.search));

  useResetFocus();
  useLivePolling({
    live: tableState.live,
    fetchPreviousPage,
  });

  const flatData = React.useMemo(
    () => data?.pages?.flatMap((page) => page.data ?? []) ?? [],
    [data?.pages],
  );

  const liveMode = useLiveMode({
    data: flatData,
    live: tableState.live,
    anchorTimestamp: tableState.liveAnchorTimestamp,
  });

  // REMINDER: meta data is always the same for all pages as filters do not change(!)
  const lastPage = data?.pages?.[data?.pages.length - 1];
  const totalDBRowCount = lastPage?.meta?.totalRowCount;
  const filterDBRowCount = lastPage?.meta?.filterRowCount;
  const metadata = lastPage?.meta?.metadata as LogsMeta | undefined;
  const chartData = lastPage?.meta?.chartData;
  const facets = lastPage?.meta?.facets;
  const totalFetched = flatData?.length;

  React.useEffect(() => {
    setCefEnabled(metadata?.cefEnabled ?? false);
  }, [metadata?.cefEnabled]);

  const filterFields = React.useMemo(() => {
    return defaultFilterFields
      .filter(
        (field) =>
          cefEnabled || !cefFilterFieldIDs.has(String(field.value)),
      )
      .map((field) => {
        if (field.value === "cefExt" || field.value === "msgField") {
          const metadataKeys =
            field.value === "cefExt"
              ? metadata?.cefExtensionKeys
              : metadata?.messageFieldKeys;
          const placeholder =
            metadataKeys?.length && metadataKeys.length > 0
              ? metadataKeys
                  .slice(0, 3)
                  .map((key) => `${key}=...`)
                  .join("; ")
              : "placeholder" in field
                ? field.placeholder
                : undefined;

          return {
            ...field,
            placeholder,
          };
        }

        const facetsField = facets?.[field.value];
        if (!facetsField) return field;
        if (field.options && field.options.length > 0) return field;

        const options = facetsField.rows.map(({ value }) => {
          return {
            label: `${value}`,
            value,
          };
        });

        return { ...field, options };
      });
  }, [
    cefEnabled,
    cefFilterFieldIDs,
    facets,
    metadata?.cefExtensionKeys,
    metadata?.messageFieldKeys,
  ]);

  const activeSheetFields = React.useMemo(
    () =>
      sheetFields.filter(
        (field) =>
          cefEnabled || !cefSheetFieldIDs.has(String(field.id)),
      ),
    [cefEnabled, cefSheetFieldIDs],
  );

  return (
    <DataTableInfinite
      key={cefEnabled ? "cef-enabled" : "cef-disabled"}
      columns={activeColumns}
      data={flatData}
      columnFilters={tableState.columnFilters}
      onColumnFiltersChange={tableState.setColumnFilters}
      sorting={tableState.sorting}
      onSortingChange={tableState.setSorting}
      selectedRowId={tableState.selectedRowId}
      onSelectedRowChange={tableState.selectRow}
      totalRows={totalDBRowCount}
      filterRows={filterDBRowCount}
      totalRowsFetched={totalFetched}
      defaultColumnVisibility={{
        cefVersion: false,
        cefDeviceVendor: false,
        cefDeviceProduct: false,
        cefDeviceVersion: false,
        cefSignatureId: false,
        cefExt: false,
        msgField: false,
      }}
      meta={metadata}
      filterFields={filterFields}
      sheetFields={activeSheetFields}
      isFetching={isFetching}
      isLoading={isLoading}
      fetchNextPage={fetchNextPage}
      hasNextPage={hasNextPage}
      chartData={chartData}
      chartDataColumnId="timestamp"
      rowVisualSignature={tableState.liveAnchorTimestamp ?? 0}
      getRowClassName={(row) => {
        const rowTimestamp = row.original.timestamp.getTime();
        const isPast = rowTimestamp <= (liveMode.timestamp || -1);
        const severityClassName = getSeverityRowClassName(
          SEVERITY_VALUES[row.original.severity],
        );
        return cn(severityClassName, isPast ? "opacity-50" : "opacity-100");
      }}
      getRowId={(row) => String(row.id)}
      getFacetedUniqueValues={getFacetedUniqueValues(facets)}
      renderActions={() => [
        <RefreshButton key="refresh" onClick={refetch} />,
        <LiveButton
          key="live"
          live={tableState.live}
          onToggle={tableState.toggleLive}
        />,
      ]}
      renderLiveRow={(props) => {
        if (!liveMode.timestamp) return null;
        if (!liveMode.row || props?.row?.original.id !== liveMode.row.id) {
          return null;
        }
        return <LiveRow />;
      }}
      renderSheetTitle={(props) =>
        (cefEnabled ? props.row?.original.cefName : undefined) ||
        props.row?.original.message
      }
      searchParamsParser={searchParamsParser}
    />
  );
}

function getColumnDefID<TData>(
  column: ColumnDef<TData>,
  index: number,
) {
  if ("id" in column && typeof column.id === "string") return column.id;
  if (
    "accessorKey" in column &&
    typeof column.accessorKey === "string" &&
    column.accessorKey.length > 0
  ) {
    return column.accessorKey;
  }

  return `column-${index}`;
}

function useResetFocus() {
  useHotKey(() => {
    // FIXME: some dedicated div[tabindex="0"] do not auto-unblur (e.g. the DataTableFilterResetButton)
    // REMINDER: we cannot just document.activeElement?.blur(); as the next tab will focus the next element in line,
    // which is not what we want. We want to reset entirely.
    document.body.setAttribute("tabindex", "0");
    document.body.focus();
    document.body.removeAttribute("tabindex");
  }, HOTKEYS.resetFocus);
}

function useLivePolling({
  live,
  fetchPreviousPage,
}: {
  live: boolean;
  fetchPreviousPage: () => Promise<unknown>;
}) {
  const fetchPreviousPageRef = React.useRef(fetchPreviousPage);

  React.useEffect(() => {
    fetchPreviousPageRef.current = fetchPreviousPage;
  }, [fetchPreviousPage]);

  React.useEffect(() => {
    if (!live) return;

    let timeoutId: NodeJS.Timeout | undefined;
    let cancelled = false;

    async function fetchData() {
      await fetchPreviousPageRef.current();
      if (cancelled) return;
      timeoutId = setTimeout(fetchData, LIVE_REFRESH_INTERVAL);
    }

    void fetchData();

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [live]);
}

export function useLiveMode<TData extends { timestamp: Date; id: number }>({
  data,
  live,
  anchorTimestamp,
}: {
  data: TData[];
  live: boolean;
  anchorTimestamp?: number;
}) {
  const anchorRow = React.useMemo(() => {
    if (!live || !anchorTimestamp) return undefined;

    return data.find((item) => item.timestamp.getTime() <= anchorTimestamp);
  }, [anchorTimestamp, data, live]);

  return { row: anchorRow, timestamp: anchorTimestamp };
}

export function getFacetedUniqueValues<TData>(
  facets?: Record<string, FacetMetadataSchema>,
) {
  return (_: TTable<TData>, columnId: string): Map<string, number> => {
    return new Map(
      facets?.[columnId]?.rows?.map(({ value, total }) => [value, total]) || [],
    );
  };
}

"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/custom/table";
import { DataTableFilterCommand } from "@/components/data-table/data-table-filter-command";
import { DataTableFilterControls } from "@/components/data-table/data-table-filter-controls";
import { DataTableProvider } from "@/components/data-table/data-table-provider";
import { DataTableResetButton } from "@/components/data-table/data-table-reset-button";
import { MemoizedDataTableSheetContent } from "@/components/data-table/data-table-sheet/data-table-sheet-content";
import { DataTableSheetDetails } from "@/components/data-table/data-table-sheet/data-table-sheet-details";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import type {
  DataTableFilterField,
  SheetField,
} from "@/components/data-table/types";
import { Button } from "@/components/ui/button";
import { HOTKEYS } from "@/constants/hotkeys";
import { useHotKey } from "@/hooks/use-hot-key";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { formatCompactNumber } from "@/lib/format";
import {
  arrSome,
  inDateRange,
  matchCEFExtensions,
} from "@/lib/table/filterfns";
import { cn } from "@/lib/utils";
import {
  type FetchNextPageOptions,
  type RefetchOptions,
} from "@tanstack/react-query";
import type {
  ColumnDef,
  ColumnFiltersState,
  OnChangeFn,
  Row,
  SortingState,
  Table as TTable,
  TableOptions,
  VisibilityState,
} from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedMinMaxValues as getTTableFacetedMinMaxValues,
  getFacetedUniqueValues as getTTableFacetedUniqueValues,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { LoaderCircle } from "lucide-react";
import * as React from "react";
import type { ParserBuilder } from "nuqs";
import { SocialsFooter } from "./_components/socials-footer";
import { BaseChartSchema } from "./schema";
import { TimelineChart } from "./timeline-chart";

export interface DataTableInfiniteProps<TData, TValue, TMeta> {
  columns: ColumnDef<TData, TValue>[];
  getRowClassName?: (row: Row<TData>) => string;
  getRowId?: TableOptions<TData>["getRowId"];
  data: TData[];
  columnFilters: ColumnFiltersState;
  onColumnFiltersChange: OnChangeFn<ColumnFiltersState>;
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
  selectedRowId: string | null;
  onSelectedRowChange: (rowId: string | null) => void;
  defaultColumnVisibility?: VisibilityState;
  filterFields?: DataTableFilterField<TData>[];
  sheetFields?: SheetField<TData, TMeta>[];
  getFacetedUniqueValues?: (
    table: TTable<TData>,
    columnId: string,
  ) => Map<string, number>;
  getFacetedMinMaxValues?: (
    table: TTable<TData>,
    columnId: string,
  ) => undefined | [number, number];
  totalRows?: number;
  filterRows?: number;
  totalRowsFetched?: number;
  meta: TMeta;
  chartData?: BaseChartSchema[];
  chartDataColumnId: string;
  isFetching?: boolean;
  isLoading?: boolean;
  hasNextPage?: boolean;
  fetchNextPage: (
    options?: FetchNextPageOptions | undefined,
  ) => Promise<unknown>;
  refetch?: (options?: RefetchOptions | undefined) => void;
  renderActions?: () => React.ReactNode;
  renderLiveRow?: (props?: { row: Row<TData> }) => React.ReactNode;
  renderSheetTitle: (props: { row?: Row<TData> }) => React.ReactNode;
  rowVisualSignature?: string | number;
  searchParamsParser: Record<string, ParserBuilder<any>>;
}

export function DataTableInfinite<TData, TValue, TMeta>({
  columns,
  getRowClassName,
  getRowId,
  data,
  columnFilters,
  onColumnFiltersChange,
  sorting,
  onSortingChange,
  selectedRowId,
  onSelectedRowChange,
  defaultColumnVisibility = {},
  filterFields = [],
  sheetFields = [],
  isFetching,
  isLoading,
  fetchNextPage,
  hasNextPage,
  totalRows = 0,
  filterRows = 0,
  totalRowsFetched = 0,
  chartData = [],
  chartDataColumnId,
  getFacetedUniqueValues,
  getFacetedMinMaxValues,
  meta,
  renderActions,
  renderLiveRow,
  renderSheetTitle,
  rowVisualSignature,
  searchParamsParser,
}: DataTableInfiniteProps<TData, TValue, TMeta>) {
  const defaultColumnOrder = React.useMemo(
    () => columns.map((column, index) => getColumnDefID(column, index)),
    [columns],
  );
  const [columnOrder, setColumnOrder] = useLocalStorage<string[]>(
    "data-table-column-order",
    defaultColumnOrder,
  );
  const [columnVisibility, setColumnVisibility] =
    useLocalStorage<VisibilityState>(
      "data-table-visibility",
      defaultColumnVisibility,
    );
  const [wrapCells, setWrapCells] = useLocalStorage<boolean>(
    "data-table-wrap-cells",
    false,
  );
  const topBarRef = React.useRef<HTMLDivElement>(null);
  const tableRef = React.useRef<HTMLTableElement>(null);
  const [topBarHeight, setTopBarHeight] = React.useState(0);

  const onScroll = React.useCallback(
    (e: React.UIEvent<HTMLElement>) => {
      const onPageBottom =
        Math.ceil(e.currentTarget.scrollTop + e.currentTarget.clientHeight) >=
        e.currentTarget.scrollHeight;

      if (
        onPageBottom &&
        hasNextPage &&
        !isFetching &&
        totalRowsFetched < filterRows
      ) {
        fetchNextPage();
      }
    },
    [fetchNextPage, hasNextPage, isFetching, filterRows, totalRowsFetched],
  );

  React.useEffect(() => {
    const observer = new ResizeObserver(() => {
      const rect = topBarRef.current?.getBoundingClientRect();
      if (rect) {
        setTopBarHeight(rect.height);
      }
    });

    const topBar = topBarRef.current;
    if (!topBar) return;

    observer.observe(topBar);
    return () => observer.unobserve(topBar);
  }, []);

  const table = useReactTable({
    data,
    columns,
    state: {
      columnFilters,
      sorting,
      columnVisibility,
      columnOrder,
    },
    columnResizeMode: "onChange",
    getRowId,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnFiltersChange,
    onSortingChange,
    onColumnOrderChange: setColumnOrder,
    getSortedRowModel: getSortedRowModel(),
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getTTableFacetedUniqueValues(),
    getFacetedMinMaxValues: getTTableFacetedMinMaxValues(),
    filterFns: { inDateRange, arrSome, matchCEFExtensions },
    debugAll: process.env.NEXT_PUBLIC_TABLE_DEBUG === "true",
    meta: { getRowClassName },
  });

  const rowLayoutSignature = React.useMemo(
    () =>
      JSON.stringify({
        columnOrder,
        columnVisibility,
        wrapCells,
      }),
    [columnOrder, columnVisibility, wrapCells],
  );

  const visibleColumnIDs = React.useMemo(
    () => {
      void rowLayoutSignature;
      return table.getVisibleLeafColumns().map((column) => column.id);
    },
    [rowLayoutSignature, table],
  );

  React.useEffect(() => {
    const normalizedColumnOrder = normalizeColumnOrder(
      columnOrder,
      defaultColumnOrder,
    );

    if (!areStringArraysEqual(columnOrder, normalizedColumnOrder)) {
      setColumnOrder(normalizedColumnOrder);
    }
  }, [columnOrder, defaultColumnOrder, setColumnOrder]);

  React.useEffect(() => {
    const normalizedColumnVisibility = normalizeColumnVisibility(
      columnVisibility,
      defaultColumnVisibility,
      defaultColumnOrder,
    );

    if (
      !areVisibilityStatesEqual(columnVisibility, normalizedColumnVisibility)
    ) {
      setColumnVisibility(normalizedColumnVisibility);
    }
  }, [
    columnVisibility,
    defaultColumnVisibility,
    defaultColumnOrder,
    setColumnVisibility,
  ]);

  const visibleRows = table.getRowModel().rows;

  const selectedRow = React.useMemo(() => {
    if (!selectedRowId) return undefined;
    return visibleRows.find((row) => row.id === selectedRowId);
  }, [selectedRowId, visibleRows]);

  React.useEffect(() => {
    if (!selectedRowId || selectedRow || isLoading || isFetching) return;
    onSelectedRowChange(null);
  }, [
    isFetching,
    isLoading,
    onSelectedRowChange,
    selectedRow,
    selectedRowId,
  ]);

  const selectedRowIndex = React.useMemo(() => {
    if (!selectedRow) return -1;
    return visibleRows.findIndex((row) => row.id === selectedRow.id);
  }, [selectedRow, visibleRows]);

  const prevRowId =
    selectedRowIndex > 0 ? visibleRows[selectedRowIndex - 1]?.id : undefined;
  const nextRowId =
    selectedRowIndex >= 0 ? visibleRows[selectedRowIndex + 1]?.id : undefined;

  const handleCloseSelectedRow = React.useCallback(() => {
    const rowId = selectedRowId;
    onSelectedRowChange(null);

    if (!rowId) return;

    setTimeout(() => {
      document.getElementById(rowId)?.focus();
    }, 0);
  }, [onSelectedRowChange, selectedRowId]);

  const handleSelectRow = React.useCallback(
    (rowId: string) => {
      onSelectedRowChange(selectedRowId === rowId ? null : rowId);
    },
    [onSelectedRowChange, selectedRowId],
  );

  const handlePrevRow = React.useCallback(() => {
    if (prevRowId) {
      onSelectedRowChange(prevRowId);
    }
  }, [onSelectedRowChange, prevRowId]);

  const handleNextRow = React.useCallback(() => {
    if (nextRowId) {
      onSelectedRowChange(nextRowId);
    }
  }, [nextRowId, onSelectedRowChange]);

  const visibleRowCount = visibleRows.length;
  const canLoadMore = Boolean(hasNextPage) && visibleRowCount > 0;

  const columnSizingInfo = table.getState().columnSizingInfo;
  const columnSizing = table.getState().columnSizing;
  const tableColumnVisibility = table.getState().columnVisibility;
  const columnSizingSignature = React.useMemo(
    () =>
      JSON.stringify({
        columnSizing,
        columnSizingInfo,
        columnVisibility: tableColumnVisibility,
      }),
    [columnSizing, columnSizingInfo, tableColumnVisibility],
  );

  const columnSizeVars = React.useMemo(() => {
    void columnSizingSignature;
    const headers = table.getFlatHeaders();
    const colSizes: { [key: string]: string } = {};

    for (const header of headers) {
      const headerID = toCSSVariableID(header.id);
      const columnID = toCSSVariableID(header.column.id);
      colSizes[`--header-${headerID}-size`] = `${header.getSize()}px`;
      colSizes[`--col-${columnID}-size`] = `${header.column.getSize()}px`;
    }

    return colSizes;
  }, [columnSizingSignature, table]);

  useHotKey(() => {
    setColumnOrder(defaultColumnOrder);
    setColumnVisibility(defaultColumnVisibility);
  }, HOTKEYS.resetColumns);

  return (
    <DataTableProvider
      table={table}
      columns={columns}
      filterFields={filterFields}
      columnFilters={columnFilters}
      sorting={sorting}
      columnOrder={columnOrder}
      columnVisibility={columnVisibility}
      wrapCells={wrapCells}
      setWrapCells={setWrapCells}
      enableColumnOrdering={true}
      isLoading={isFetching || isLoading}
      getFacetedUniqueValues={getFacetedUniqueValues}
      getFacetedMinMaxValues={getFacetedMinMaxValues}
    >
      <div
        className="flex h-full min-h-screen w-full flex-col sm:flex-row"
        style={
          {
            "--top-bar-height": `${topBarHeight}px`,
            ...columnSizeVars,
          } as React.CSSProperties
        }
      >
        <div
          className={cn(
            "hidden h-full w-full flex-col sm:flex sm:sticky sm:top-0 sm:max-h-screen sm:min-h-screen sm:min-w-52 sm:max-w-52 sm:self-start md:min-w-72 md:max-w-72",
            "group-data-[expanded=false]/controls:hidden",
          )}
        >
          <div className="border-b border-border bg-background p-2 md:sticky md:top-0">
            <div className="flex h-[46px] items-center justify-between gap-3">
              <p className="px-2 font-medium text-foreground">Filters</p>
              <div>
                {columnFilters.length ? <DataTableResetButton /> : null}
              </div>
            </div>
          </div>
          <div className="flex-1 p-2 sm:overflow-y-scroll">
            <DataTableFilterControls />
          </div>
          <div className="border-t border-border bg-background p-4 md:sticky md:bottom-0">
            <SocialsFooter />
          </div>
        </div>
        <div
          className={cn(
            "flex max-w-full flex-1 flex-col border-border sm:border-l",
            "group-data-[expanded=true]/controls:sm:max-w-[calc(100vw_-_208px)] group-data-[expanded=true]/controls:md:max-w-[calc(100vw_-_288px)]",
          )}
        >
          <div
            ref={topBarRef}
            className={cn(
              "sticky top-0 z-10 flex flex-col gap-4 bg-background p-2 pb-4",
            )}
          >
            <DataTableFilterCommand searchParamsParser={searchParamsParser} />
            <DataTableToolbar renderActions={renderActions} />
            <TimelineChart
              data={chartData}
              className="-mb-2"
              columnId={chartDataColumnId}
            />
          </div>
          <div className="z-0">
            <Table
              ref={tableRef}
              onScroll={onScroll}
              className="border-separate border-spacing-0"
              containerClassName="max-h-[calc(100vh_-_var(--top-bar-height))]"
            >
              <TableHeader className={cn("sticky top-0 z-20 bg-background")}>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow
                    key={headerGroup.id}
                    className={cn(
                      "bg-muted/50 hover:bg-muted/50",
                      "[&>*]:border-t [&>:not(:last-child)]:border-r",
                    )}
                  >
                    {headerGroup.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        className={cn(
                          "relative select-none truncate border-b border-border [&>.cursor-col-resize]:last:opacity-0",
                          header.column.columnDef.meta?.headerClassName,
                        )}
                        aria-sort={
                          header.column.getIsSorted() === "asc"
                            ? "ascending"
                            : header.column.getIsSorted() === "desc"
                              ? "descending"
                              : "none"
                        }
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                        {header.column.getCanResize() ? (
                          <div
                            onDoubleClick={() => header.column.resetSize()}
                            onMouseDown={header.getResizeHandler()}
                            onTouchStart={header.getResizeHandler()}
                            className={cn(
                              "user-select-none absolute -right-2 top-0 z-10 flex h-full w-4 cursor-col-resize touch-none justify-center",
                              "before:absolute before:inset-y-0 before:w-px before:translate-x-px before:bg-border",
                            )}
                          />
                        ) : null}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody
                id="content"
                tabIndex={-1}
                className="outline-1 -outline-offset-1 outline-primary transition-colors focus-visible:outline"
                style={{
                  scrollMarginTop: "calc(var(--top-bar-height) + 40px)",
                }}
              >
                {visibleRows.length ? (
                  visibleRows.map((row) => (
                    <React.Fragment key={row.id}>
                      {renderLiveRow?.({ row })}
                      <MemoizedRow
                        key={`${row.id}:${rowLayoutSignature}`}
                        row={row}
                        selected={selectedRowId === row.id}
                        layoutSignature={rowLayoutSignature}
                        visibleColumnIDs={visibleColumnIDs}
                        wrapCells={wrapCells}
                        onSelectRow={handleSelectRow}
                        getRowClassName={getRowClassName}
                        rowVisualSignature={rowVisualSignature}
                      />
                    </React.Fragment>
                  ))
                ) : (
                  <React.Fragment>
                    {renderLiveRow?.()}
                    <TableRow>
                      <TableCell
                        colSpan={table.getVisibleLeafColumns().length}
                        className="h-24 text-center"
                      >
                        No results.
                      </TableCell>
                    </TableRow>
                  </React.Fragment>
                )}
                <TableRow className="hover:bg-transparent data-[state=selected]:bg-transparent">
                  <TableCell
                    colSpan={table.getVisibleLeafColumns().length}
                    className="text-center"
                  >
                    {canLoadMore || isFetching || isLoading ? (
                      <Button
                        disabled={isFetching || isLoading || !canLoadMore}
                        onClick={() => fetchNextPage()}
                        size="sm"
                        variant="outline"
                      >
                        {isFetching ? (
                          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        Load More
                      </Button>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No more data to load (
                        <span className="font-mono font-medium">
                          {formatCompactNumber(filterRows)}
                        </span>{" "}
                        of{" "}
                        <span className="font-mono font-medium">
                          {formatCompactNumber(totalRows)}
                        </span>{" "}
                        rows)
                      </p>
                    )}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
      <DataTableSheetDetails
        open={!!selectedRow}
        title={renderSheetTitle({ row: selectedRow })}
        titleClassName="font-mono"
        isLoading={Boolean(selectedRowId && !selectedRow && (isLoading || isFetching))}
        canPrev={Boolean(prevRowId)}
        canNext={Boolean(nextRowId)}
        onPrev={handlePrevRow}
        onNext={handleNextRow}
        onClose={handleCloseSelectedRow}
      >
        <MemoizedDataTableSheetContent
          table={table}
          data={selectedRow?.original}
          filterFields={filterFields}
          fields={sheetFields}
          metadata={{
            totalRows,
            filterRows,
            totalRowsFetched,
            ...meta,
          }}
        />
      </DataTableSheetDetails>
    </DataTableProvider>
  );
}

function getColumnDefID<TData, TValue>(
  column: ColumnDef<TData, TValue>,
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

function normalizeColumnOrder(
  columnOrder: string[],
  defaultColumnOrder: string[],
) {
  const allowedColumnIDs = new Set(defaultColumnOrder);
  const seenColumnIDs = new Set<string>();
  const nextColumnOrder = columnOrder.filter((id) => {
    if (!allowedColumnIDs.has(id) || seenColumnIDs.has(id)) {
      return false;
    }

    seenColumnIDs.add(id);
    return true;
  });

  for (const columnID of defaultColumnOrder) {
    if (!nextColumnOrder.includes(columnID)) {
      nextColumnOrder.push(columnID);
    }
  }

  return nextColumnOrder;
}

function normalizeColumnVisibility(
  columnVisibility: VisibilityState,
  defaultColumnVisibility: VisibilityState,
  defaultColumnOrder: string[],
) {
  const nextColumnVisibility: VisibilityState = {};

  for (const columnID of defaultColumnOrder) {
    if (typeof columnVisibility[columnID] === "boolean") {
      nextColumnVisibility[columnID] = columnVisibility[columnID];
      continue;
    }

    if (typeof defaultColumnVisibility[columnID] === "boolean") {
      nextColumnVisibility[columnID] = defaultColumnVisibility[columnID];
    }
  }

  return nextColumnVisibility;
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

function areVisibilityStatesEqual(
  left: VisibilityState,
  right: VisibilityState,
) {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();

  if (!areStringArraysEqual(leftKeys, rightKeys)) {
    return false;
  }

  for (const key of leftKeys) {
    if (left[key] !== right[key]) {
      return false;
    }
  }

  return true;
}

function toCSSVariableID(value: string) {
  return value.replaceAll(".", "-").toLowerCase();
}

function Row<TData>({
  row,
  selected,
  layoutSignature,
  visibleColumnIDs,
  wrapCells,
  onSelectRow,
  getRowClassName,
  rowVisualSignature,
}: {
  row: Row<TData>;
  selected?: boolean;
  layoutSignature: string;
  visibleColumnIDs: string[];
  wrapCells: boolean;
  onSelectRow: (rowId: string) => void;
  getRowClassName?: (row: Row<TData>) => string;
  rowVisualSignature?: string | number;
}) {
  void layoutSignature;
  void rowVisualSignature;

  const cellsByColumnID = new Map(
    row.getAllCells().map((cell) => [cell.column.id, cell]),
  );

  return (
    <TableRow
      id={row.id}
      tabIndex={0}
      data-state={selected ? "selected" : undefined}
      onClick={() => onSelectRow(row.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onSelectRow(row.id);
        }
      }}
      className={cn(
        "[&>:not(:last-child)]:border-r",
        "outline-1 -outline-offset-1 outline-primary transition-colors focus-visible:bg-muted/50 focus-visible:outline data-[state=selected]:outline",
        getRowClassName?.(row),
      )}
    >
      {visibleColumnIDs.map((columnID) => {
        const cell = cellsByColumnID.get(columnID);
        if (!cell) return null;

        return (
          <TableCell
            key={cell.id}
            className={cn(
              "border-b border-border",
              wrapCells
                ? "whitespace-pre-wrap break-words align-top"
                : "truncate",
              cell.column.columnDef.meta?.cellClassName,
            )}
          >
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </TableCell>
        );
      })}
    </TableRow>
  );
}

const MemoizedRow = React.memo(
  Row,
  (prev, next) =>
    prev.row.id === next.row.id &&
    prev.selected === next.selected &&
    prev.layoutSignature === next.layoutSignature &&
    prev.wrapCells === next.wrapCells &&
    prev.rowVisualSignature === next.rowVisualSignature,
) as typeof Row;

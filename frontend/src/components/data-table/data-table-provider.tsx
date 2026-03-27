import { DataTableFilterField } from "@/components/data-table/types";
import type {
  ColumnDef,
  ColumnFiltersState,
  PaginationState,
  SortingState,
  Table,
  VisibilityState,
} from "@tanstack/react-table";
import type { Dispatch, SetStateAction } from "react";
import { createContext, useContext, useMemo } from "react";
import { ControlsProvider } from "../../providers/controls";

// REMINDER: read about how to move controlled state out of the useReactTable hook
// https://github.com/TanStack/table/discussions/4005#discussioncomment-7303569

interface DataTableStateContextType {
  columnFilters: ColumnFiltersState;
  sorting: SortingState;
  columnOrder: string[];
  columnVisibility: VisibilityState;
  wrapCells: boolean;
  setWrapCells: Dispatch<SetStateAction<boolean>>;
  pagination: PaginationState;
  enableColumnOrdering: boolean;
}

interface DataTableBaseContextType<TData = unknown, TValue = unknown> {
  table: Table<TData>;
  filterFields: DataTableFilterField<TData>[];
  columns: ColumnDef<TData, TValue>[];
  isLoading?: boolean;
  getFacetedUniqueValues?: (
    table: Table<TData>,
    columnId: string,
  ) => Map<string, number>;
  getFacetedMinMaxValues?: (
    table: Table<TData>,
    columnId: string,
  ) => undefined | [number, number];
}

interface DataTableContextType<TData = unknown, TValue = unknown>
  extends DataTableStateContextType,
    DataTableBaseContextType<TData, TValue> {}

export const DataTableContext = createContext<DataTableContextType<
  any,
  any
> | null>(null);
const noopSetWrapCells: Dispatch<SetStateAction<boolean>> = () => undefined;

export function DataTableProvider<TData, TValue>({
  children,
  ...props
}: Partial<DataTableStateContextType> &
  DataTableBaseContextType<TData, TValue> & {
    children: React.ReactNode;
  }) {
  const {
    columnFilters,
    sorting,
    columnOrder,
    columnVisibility,
    wrapCells,
    setWrapCells,
    pagination,
    table,
    filterFields,
    columns,
    enableColumnOrdering,
    isLoading,
    getFacetedUniqueValues,
    getFacetedMinMaxValues,
  } = props;

  const value = useMemo(
    () => ({
      table,
      filterFields,
      columns,
      isLoading,
      getFacetedUniqueValues,
      getFacetedMinMaxValues,
      columnFilters: columnFilters ?? [],
      sorting: sorting ?? [],
      columnOrder: columnOrder ?? [],
      columnVisibility: columnVisibility ?? {},
      wrapCells: wrapCells ?? false,
      setWrapCells: setWrapCells ?? noopSetWrapCells,
      pagination: pagination ?? { pageIndex: 0, pageSize: 10 },
      enableColumnOrdering: enableColumnOrdering ?? false,
    }),
    [
      columnFilters,
      sorting,
      columnOrder,
      columnVisibility,
      wrapCells,
      setWrapCells,
      pagination,
      table,
      filterFields,
      columns,
      enableColumnOrdering,
      isLoading,
      getFacetedUniqueValues,
      getFacetedMinMaxValues,
    ],
  );

  return (
    <DataTableContext.Provider value={value}>
      <ControlsProvider>{children}</ControlsProvider>
    </DataTableContext.Provider>
  );
}

export function useDataTable<TData, TValue>() {
  const context = useContext(DataTableContext);

  if (!context) {
    throw new Error("useDataTable must be used within a DataTableProvider");
  }

  return context as DataTableContextType<TData, TValue>;
}

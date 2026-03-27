import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/custom/table";
import { DataTableSheetRowAction } from "@/components/data-table/data-table-sheet/data-table-sheet-row-action";
import type { DataTableFilterField } from "@/components/data-table/types";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import type { Table as TTable } from "@tanstack/react-table";
import { Check, Copy } from "lucide-react";

interface KVTableProps<TData> {
  data: Record<string, string | number | boolean>;
  fieldValue?: string;
  filterFields?: DataTableFilterField<TData>[];
  table?: TTable<TData>;
}
export function KVTable<TData>({
  data,
  fieldValue,
  filterFields,
  table,
}: KVTableProps<TData>) {
  return (
    <div className="mx-auto max-w-lg">
      <div className="overflow-hidden rounded-lg border border-border bg-background">
        <Table>
          <TableBody>
            {Object.entries(data).map(([key, value]) => {
              return (
                <RowAction
                  key={key}
                  label={key}
                  value={value}
                  fieldValue={fieldValue}
                  filterFields={filterFields}
                  table={table}
                />
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function RowAction({
  label,
  value,
  fieldValue,
  filterFields,
  table,
}: {
  label: string;
  value: string | number | boolean;
  fieldValue?: string;
  filterFields?: DataTableFilterField<any>[];
  table?: TTable<any>;
}) {
  const { copy, isCopied } = useCopyToClipboard();
  const content = (
    <>
      <TableCell className="bg-muted/50 py-1 font-mono font-medium">
        {label}
      </TableCell>
      <TableCell className="relative py-1 font-mono">
        {value}
        <div className="invisible absolute right-1.5 top-1.5 rounded-sm border border-border bg-background p-0.5 backdrop-blur-sm group-hover:visible">
          {!isCopied ? (
            <Copy className="h-3 w-3" />
          ) : (
            <Check className="h-3 w-3" />
          )}
        </div>
      </TableCell>
    </>
  );

  if (!fieldValue || !filterFields || !table) {
    return (
      <TableRow
        className="group text-left *:border-border hover:bg-transparent [&>:not(:last-child)]:border-r"
        onClick={(e) => {
          e.stopPropagation();
          copy(value.toString());
        }}
      >
        {content}
      </TableRow>
    );
  }

  return (
    <DataTableSheetRowAction
      fieldValue={fieldValue}
      filterFields={filterFields}
      objectFilterKey={label}
      value={value}
      table={table}
      asChild
    >
      <TableRow
        className="group text-left *:border-border hover:bg-transparent [&>:not(:last-child)]:border-r"
      >
        {content}
      </TableRow>
    </DataTableSheetRowAction>
  );
}

"use client";

import {
  Sortable,
  SortableDragHandle,
  SortableItem,
} from "@/components/custom/sortable";
import { useDataTable } from "@/components/data-table/data-table-provider";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Check, GripVertical, Settings2 } from "lucide-react";
import { useMemo, useState } from "react";

export function DataTableViewOptions() {
  const { table, enableColumnOrdering } = useDataTable();
  const [open, setOpen] = useState(false);
  const [drag, setDrag] = useState(false);
  const [search, setSearch] = useState("");

  const columnOrder = table.getState().columnOrder;

  const orderedColumns = useMemo(() => {
    const columns = table.getAllLeafColumns();

    return [...columns].sort((a, b) => {
      const leftIndex = columnOrder.indexOf(a.id);
      const rightIndex = columnOrder.indexOf(b.id);

      if (leftIndex === -1 && rightIndex === -1) return 0;
      if (leftIndex === -1) return 1;
      if (rightIndex === -1) return -1;

      return leftIndex - rightIndex;
    });
  }, [columnOrder, table]);

  const configurableColumns = useMemo(
    () =>
      orderedColumns.filter(
        (column) =>
          typeof column.accessorFn !== "undefined" && column.getCanHide(),
      ),
    [orderedColumns],
  );

  const handleColumnOrderChange = (items: Array<{ id: string }>) => {
    const configurableColumnIds = new Set(configurableColumns.map((c) => c.id));
    const reorderedConfigurableIds = items.map((item) => item.id);
    let reorderIndex = 0;

    const nextColumnOrder = orderedColumns.map((column) => {
      if (!configurableColumnIds.has(column.id)) return column.id;

      const nextId = reorderedConfigurableIds[reorderIndex];
      reorderIndex += 1;
      return nextId ?? column.id;
    });

    table.setColumnOrder(nextColumnOrder);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          className="gap-2"
        >
          <Settings2 className="h-4 w-4" />
          <span>Columns</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-[200px] p-0">
        <Command>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder="Search options..."
          />
          <CommandList>
            <CommandEmpty>No option found.</CommandEmpty>
            <CommandGroup>
              <Sortable
                value={configurableColumns.map((column) => ({ id: column.id }))}
                onValueChange={handleColumnOrderChange}
                overlay={<div className="h-8 w-full rounded-md bg-muted/60" />}
                onDragStart={() => setDrag(true)}
                onDragEnd={() => setDrag(false)}
                onDragCancel={() => setDrag(false)}
              >
                {configurableColumns.map((column) => (
                  <SortableItem key={column.id} value={column.id} asChild>
                    <CommandItem
                      value={column.id}
                      onSelect={() =>
                        column.toggleVisibility(!column.getIsVisible())
                      }
                      className={"capitalize"}
                      disabled={drag}
                    >
                      <div
                        className={cn(
                          "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                          column.getIsVisible()
                            ? "bg-primary text-primary-foreground"
                            : "opacity-50 [&_svg]:invisible",
                        )}
                      >
                        <Check className={cn("h-4 w-4")} />
                      </div>
                      <span>{column.columnDef.meta?.label || column.id}</span>
                      {enableColumnOrdering && !search ? (
                        <SortableDragHandle
                          variant="ghost"
                          size="icon"
                          className="ml-auto size-5 text-muted-foreground hover:text-foreground focus:bg-muted focus:text-foreground"
                        >
                          <GripVertical className="size-4" aria-hidden="true" />
                        </SortableDragHandle>
                      ) : null}
                    </CommandItem>
                  </SortableItem>
                ))}
              </Sortable>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

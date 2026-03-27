import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { cn } from "@/lib/utils";
import { Table } from "@tanstack/react-table";
import { endOfDay, endOfHour, startOfDay, startOfHour } from "date-fns";
import {
  CalendarClock,
  CalendarDays,
  CalendarSearch,
  ChevronLeft,
  ChevronRight,
  Copy,
  Equal,
  Search,
  X,
} from "lucide-react";
import { DataTableFilterField } from "../types";

interface DataTableSheetRowActionProps<
  TData,
  TFields extends DataTableFilterField<TData>,
> extends Omit<React.ComponentPropsWithRef<typeof DropdownMenuTrigger>, "value"> {
  fieldValue: TFields["value"];
  filterFields: TFields[];
  value: string | number | boolean;
  objectFilterKey?: string;
  table: Table<TData>;
}

export function DataTableSheetRowAction<
  TData,
  TFields extends DataTableFilterField<TData>,
>({
  fieldValue,
  filterFields,
  value,
  objectFilterKey,
  children,
  className,
  table,
  onKeyDown,
  asChild = false,
  disabled,
}: DataTableSheetRowActionProps<TData, TFields>) {
  const { copy, isCopied } = useCopyToClipboard();
  const field = filterFields.find((field) => field.value === fieldValue);
  const column = table.getColumn(fieldValue.toString());

  if (!field || !column) return null;

  function renderOptions() {
    if (!field) return null;
    switch (field.type) {
      case "checkbox":
        return (
          <DropdownMenuItem
            onClick={() => {
              // FIXME:
              const filterValue = column?.getFilterValue() as
                | undefined
                | Array<unknown>;
              const newValue = filterValue?.includes(value)
                ? filterValue
                : [...(filterValue || []), value];

              column?.setFilterValue(newValue);
            }}
          >
            <Search />
            Include
          </DropdownMenuItem>
        );
      case "input":
        return (
          <DropdownMenuGroup>
            <DropdownMenuItem
              onClick={() => {
                if (objectFilterKey) {
                  const currentValue = column?.getFilterValue();
                  const nextValue =
                    currentValue &&
                    typeof currentValue === "object" &&
                    !Array.isArray(currentValue)
                      ? { ...(currentValue as Record<string, string>) }
                      : {};
                  nextValue[objectFilterKey] = String(value);
                  column?.setFilterValue(nextValue);
                  return;
                }

                column?.setFilterValue((currentValue: unknown) =>
                  appendStringFilterValue(currentValue, String(value)),
                );
              }}
            >
              <Search />
              Include
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                if (objectFilterKey) {
                  const currentValue = column?.getFilterValue();
                  const nextValue =
                    currentValue &&
                    typeof currentValue === "object" &&
                    !Array.isArray(currentValue)
                      ? { ...(currentValue as Record<string, string>) }
                      : {};
                  nextValue[objectFilterKey] = `!${String(value)}`;
                  column?.setFilterValue(nextValue);
                  return;
                }

                column?.setFilterValue((currentValue: unknown) =>
                  appendStringFilterValue(currentValue, `!${String(value)}`),
                );
              }}
            >
              <X />
              Exclude
            </DropdownMenuItem>
          </DropdownMenuGroup>
        );
      case "slider":
        return (
          <DropdownMenuGroup>
            <DropdownMenuItem
              onClick={() => column?.setFilterValue([0, value])}
            >
              {/* FIXME: change icon as it is not clear */}
              <ChevronLeft />
              Less or equal than
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => column?.setFilterValue([value, 5000])}
            >
              {/* FIXME: change icon as it is not clear */}
              <ChevronRight />
              Greater or equal than
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => column?.setFilterValue([value])}>
              <Equal />
              Equal to
            </DropdownMenuItem>
          </DropdownMenuGroup>
        );
      case "timerange":
        const date = new Date(value as string | number);
        return (
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => column?.setFilterValue([date])}>
              <CalendarSearch />
              Exact timestamp
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                const start = startOfHour(date);
                const end = endOfHour(date);
                column?.setFilterValue([start, end]);
              }}
            >
              <CalendarClock />
              Same hour
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                const start = startOfDay(date);
                const end = endOfDay(date);
                column?.setFilterValue([start, end]);
              }}
            >
              <CalendarDays />
              Same day
            </DropdownMenuItem>
          </DropdownMenuGroup>
        );
      default:
        return null;
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        asChild
      >
        {asChild ? (
          children
        ) : (
          <div
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-disabled={disabled}
            data-disabled={disabled ? "" : undefined}
            className={cn(
              "rounded-md ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              disabled && "pointer-events-none opacity-50",
              "relative",
              className,
            )}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                // REMINDER: default behavior is to open the dropdown menu
                // But because we use it to navigate between rows, we need to prevent it
                // and only use "Enter" to select the option
                e.preventDefault();
              }
              (
                onKeyDown as
                  | React.KeyboardEventHandler<HTMLDivElement>
                  | undefined
              )?.(e);
            }}
          >
            {children}
            {isCopied ? (
              <div className="absolute inset-0 place-content-center bg-background/70">
                Value copied
              </div>
            ) : null}
          </div>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="left">
        {renderOptions()}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => copy(String(value), { timeout: 1000 })}
        >
          <Copy />
          Copy value
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function appendStringFilterValue(
  currentValue: unknown,
  nextValue: string,
): string | string[] {
  const currentValues = Array.isArray(currentValue)
    ? currentValue.filter((value): value is string => typeof value === "string")
    : typeof currentValue === "string"
      ? [currentValue]
      : [];

  if (currentValues.includes(nextValue)) {
    return currentValues.length === 1 ? currentValues[0] : currentValues;
  }

  const combinedValues = [...currentValues, nextValue];
  return combinedValues.length === 1 ? combinedValues[0] : combinedValues;
}

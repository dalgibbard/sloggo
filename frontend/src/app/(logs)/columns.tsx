"use client";

import { TextWithTooltip } from "@/components/custom/text-with-tooltip";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { DataTableColumnSeverityIndicator } from "@/components/data-table/data-table-column/data-table-column-severity-indicator";
import { SEVERITY_VALUES } from "@/constants/severity";
import { matchCEFExtensions, matchStringFilter } from "@/lib/table/filterfns";
import type { ColumnDef } from "@tanstack/react-table";
import { HoverCardTimestamp } from "./_components/hover-card-timestamp";
import type { ColumnSchema } from "./schema";

// Facility names for display
const FACILITY_NAMES = [
  "Kernel",
  "User",
  "Mail",
  "Daemon",
  "Auth",
  "Syslog",
  "LPR",
  "News",
  "UUCP",
  "Cron",
  "AuthPriv",
  "FTP",
  "NTP",
  "Audit",
  "Alert",
  "Clock",
  "Local0",
  "Local1",
  "Local2",
  "Local3",
  "Local4",
  "Local5",
  "Local6",
  "Local7",
];

function renderValue(value: string | undefined) {
  if (!value) {
    return <span className="text-muted-foreground">-</span>;
  }

  return <TextWithTooltip text={value} />;
}

export const columns: ColumnDef<ColumnSchema>[] = [
  {
    id: "severity",
    accessorKey: "severity",
    header: "",
    cell: ({ row }) => {
      const severity = row.getValue<ColumnSchema["severity"]>("severity");

      return (
        <div className="flex items-baseline gap-2">
          <DataTableColumnSeverityIndicator value={SEVERITY_VALUES[severity]} />
          <span className="font-mono text-sm">
            {" "}
            {SEVERITY_VALUES[severity]}
          </span>
          <span className="text-xs text-muted-foreground">{severity}</span>
        </div>
      );
    },
    enableHiding: false,
    enableResizing: false,
    filterFn: "arrSome",
    size: 27,
    minSize: 27,
    maxSize: 27,
    meta: {
      headerClassName:
        "w-[--header-severity-size] max-w-[--header-severity-size] min-w-[--header-severity-size]",
      cellClassName:
        "w-[--col-severity-size] max-w-[--col-severity-size] min-w-[--col-severity-size]",
    },
  },
  {
    accessorKey: "timestamp",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Timestamp" />
    ),
    cell: ({ row }) => {
      const date = new Date(
        row.getValue<ColumnSchema["timestamp"]>("timestamp"),
      );
      return <HoverCardTimestamp date={date} />;
    },
    filterFn: "inDateRange",
    enableResizing: false,
    size: 200,
    minSize: 200,
    meta: {
      headerClassName:
        "w-[--header-timestamp-size] max-w-[--header-timestamp-size] min-w-[--header-timestamp-size]",
      cellClassName:
        "font-mono w-[--col-timestamp-size] max-w-[--col-timestamp-size] min-w-[--col-timestamp-size]",
    },
  },
  {
    accessorKey: "facility",
    header: "Facility",
    cell: ({ row }) => {
      const facility = row.getValue<ColumnSchema["facility"]>("facility");
      return (
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-sm">{FACILITY_NAMES[facility]}</span>
          <span className="text-xs text-muted-foreground">{facility}</span>
        </div>
      );
    },
    filterFn: "arrSome",
    enableResizing: false,
    size: 100,
    minSize: 100,
    meta: {
      headerClassName:
        "w-[--header-facility-size] max-w-[--header-facility-size] min-w-[--header-facility-size]",
      cellClassName:
        "font-mono w-[--col-facility-size] max-w-[--col-facility-size] min-w-[--col-facility-size]",
    },
  },
  {
    accessorKey: "format",
    header: "Format",
    filterFn: matchStringFilter,
    cell: ({ row }) => {
      const value = row.getValue<ColumnSchema["format"]>("format");
      return <span className="font-mono capitalize">{value}</span>;
    },
    size: 75,
    minSize: 75,
    meta: {
      cellClassName:
        "font-mono w-[--col-format-size] max-w-[--col-format-size]",
      headerClassName: "min-w-[--header-format-size] w-[--header-format-size]",
    },
  },
  {
    accessorKey: "hostname",
    header: "Hostname",
    filterFn: matchStringFilter,
    cell: ({ row }) => {
      const value = row.getValue<ColumnSchema["hostname"]>("hostname");
      return <TextWithTooltip text={value} />;
    },
    size: 125,
    minSize: 125,
    meta: {
      cellClassName:
        "font-mono w-[--col-hostname-size] max-w-[--col-hostname-size]",
      headerClassName:
        "min-w-[--header-hostname-size] w-[--header-hostname-size]",
    },
  },
  {
    accessorKey: "appName",
    header: "App Name",
    filterFn: matchStringFilter,
    cell: ({ row }) => {
      const value = row.getValue<ColumnSchema["appName"]>("appName");
      return <TextWithTooltip text={value} />;
    },
    size: 100,
    minSize: 100,
    meta: {
      cellClassName:
        "font-mono w-[--col-appname-size] max-w-[--col-appname-size]",
      headerClassName:
        "min-w-[--header-appname-size] w-[--header-appname-size]",
    },
  },
  {
    accessorKey: "procId",
    header: "Proc ID",
    filterFn: matchStringFilter,
    cell: ({ row }) => {
      const value = row.getValue<ColumnSchema["procId"]>("procId");
      return <span className="font-mono">{value}</span>;
    },
    size: 80,
    minSize: 80,
    meta: {
      cellClassName:
        "font-mono w-[--col-procid-size] max-w-[--col-procid-size]",
      headerClassName: "min-w-[--header-procid-size] w-[--header-procid-size]",
    },
  },
  {
    accessorKey: "msgId",
    header: "Msg ID",
    filterFn: matchStringFilter,
    cell: ({ row }) => {
      const value = row.getValue<ColumnSchema["msgId"]>("msgId");
      return <span className="font-mono">{value}</span>;
    },
    size: 80,
    minSize: 80,
    meta: {
      cellClassName: "font-mono w-[--col-msgid-size] max-w-[--col-msgid-size]",
      headerClassName: "min-w-[--header-msgid-size] w-[--header-msgid-size]",
    },
  },
  {
    accessorKey: "cefName",
    header: "CEF Name",
    filterFn: matchStringFilter,
    cell: ({ row }) => {
      const value = row.getValue<ColumnSchema["cefName"]>("cefName");
      return renderValue(value);
    },
    size: 180,
    minSize: 140,
    meta: {
      cellClassName:
        "font-mono w-[--col-cefname-size] max-w-[--col-cefname-size]",
      headerClassName:
        "min-w-[--header-cefname-size] w-[--header-cefname-size]",
    },
  },
  {
    accessorKey: "cefSeverity",
    header: "CEF Severity",
    filterFn: matchStringFilter,
    cell: ({ row }) => {
      const value = row.getValue<ColumnSchema["cefSeverity"]>("cefSeverity");
      return value ? (
        <span className="font-mono">{value}</span>
      ) : (
        <span className="text-muted-foreground">-</span>
      );
    },
    size: 90,
    minSize: 90,
    meta: {
      cellClassName:
        "font-mono w-[--col-cefseverity-size] max-w-[--col-cefseverity-size]",
      headerClassName:
        "min-w-[--header-cefseverity-size] w-[--header-cefseverity-size]",
    },
  },
  {
    accessorKey: "message",
    header: "Message",
    cell: ({ row }) => {
      const value = row.getValue<ColumnSchema["message"]>("message");
      return <TextWithTooltip text={value} />;
    },
    size: 300,
    minSize: 200,
    meta: {
      cellClassName:
        "font-mono w-[--col-message-size] max-w-[--col-message-size]",
      headerClassName:
        "min-w-[--header-message-size] w-[--header-message-size]",
    },
  },
  {
    accessorKey: "structuredData",
    header: "Structured Data",
    cell: ({ row }) => {
      const value =
        row.getValue<ColumnSchema["structuredData"]>("structuredData");
      if (!value || Object.keys(value).length === 0) {
        return <span className="text-muted-foreground">-</span>;
      }
      return (
        <TextWithTooltip
          text={Object.entries(value)
            .map(
              ([sdId, kvPairs]) =>
                `${sdId}:{${Object.entries(kvPairs || {})
                  .map(([k, v]) => `${k}=${v}`)
                  .join(", ")}}`,
            )
            .join(", ")}
        />
      );
    },
    size: 150,
    minSize: 150,
    meta: {
      cellClassName:
        "font-mono w-[--col-structureddata-size] max-w-[--col-structureddata-size]",
      headerClassName:
        "min-w-[--header-structureddata-size] w-[--header-structureddata-size]",
    },
  },
  {
    accessorKey: "cefVersion",
    header: "CEF Version",
    filterFn: matchStringFilter,
    cell: ({ row }) =>
      renderValue(row.getValue<ColumnSchema["cefVersion"]>("cefVersion")),
  },
  {
    accessorKey: "cefDeviceVendor",
    header: "CEF Vendor",
    filterFn: matchStringFilter,
    cell: ({ row }) =>
      renderValue(
        row.getValue<ColumnSchema["cefDeviceVendor"]>("cefDeviceVendor"),
      ),
  },
  {
    accessorKey: "cefDeviceProduct",
    header: "CEF Product",
    filterFn: matchStringFilter,
    cell: ({ row }) =>
      renderValue(
        row.getValue<ColumnSchema["cefDeviceProduct"]>("cefDeviceProduct"),
      ),
  },
  {
    accessorKey: "cefDeviceVersion",
    header: "CEF Device Version",
    filterFn: matchStringFilter,
    cell: ({ row }) =>
      renderValue(
        row.getValue<ColumnSchema["cefDeviceVersion"]>("cefDeviceVersion"),
      ),
  },
  {
    accessorKey: "cefSignatureId",
    header: "CEF Signature ID",
    filterFn: matchStringFilter,
    cell: ({ row }) =>
      renderValue(
        row.getValue<ColumnSchema["cefSignatureId"]>("cefSignatureId"),
      ),
  },
  {
    id: "cefExt",
    accessorFn: (row) => row.cefExtensions || {},
    header: "CEF Extensions",
    filterFn: matchCEFExtensions,
    cell: ({ row }) => {
      const value = row.getValue<ColumnSchema["cefExtensions"]>("cefExt");
      if (!value || Object.keys(value).length === 0) {
        return <span className="text-muted-foreground">-</span>;
      }

      return (
        <TextWithTooltip
          text={Object.entries(value)
            .map(([key, entryValue]) => `${key}=${entryValue}`)
            .join(", ")}
        />
      );
    },
  },
];

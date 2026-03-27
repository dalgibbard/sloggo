"use client";

import { CopyToClipboardContainer } from "@/components/custom/copy-to-clipboard-container";
import { KVTable } from "@/components/custom/kv-table";
import { KVTabs } from "@/components/custom/kv-tabs";
import type {
  DataTableFilterField,
  Option,
  SheetField,
} from "@/components/data-table/types";
import { SEVERITY_LABELS, SEVERITY_VALUES } from "@/constants/severity";
import { getSeverityColor } from "@/lib/request/severity";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { parseCEFExtensionFilters, serializeCEFExtensionFilters } from "./cef";
import {
  parseMessageFieldFilters,
  serializeMessageFieldFilters,
} from "./message-fields";
import type { LogsMeta } from "./query-options";
import { type ColumnSchema } from "./schema";

export const CEF_FILTER_FIELD_IDS = [
  "cefVersion",
  "cefDeviceVendor",
  "cefDeviceProduct",
  "cefDeviceVersion",
  "cefSignatureId",
  "cefName",
  "cefSeverity",
  "cefExt",
] as const;

export const CEF_SHEET_FIELD_IDS = [
  "cefVersion",
  "cefDeviceVendor",
  "cefDeviceProduct",
  "cefDeviceVersion",
  "cefSignatureId",
  "cefName",
  "cefSeverity",
  "cefExtensions",
] as const;

// Syslog facility names
const SYSLOG_FACILITIES = [
  { label: "Kernel messages", value: 0 },
  { label: "User-level messages", value: 1 },
  { label: "Mail system", value: 2 },
  { label: "System daemons", value: 3 },
  { label: "Security/authorization messages", value: 4 },
  { label: "Messages generated internally by syslogd", value: 5 },
  { label: "Line printer subsystem", value: 6 },
  { label: "Network news subsystem", value: 7 },
  { label: "UUCP subsystem", value: 8 },
  { label: "Clock daemon", value: 9 },
  { label: "Security/authorization messages", value: 10 },
  { label: "FTP daemon", value: 11 },
  { label: "NTP subsystem", value: 12 },
  { label: "Log audit", value: 13 },
  { label: "Log alert", value: 14 },
  { label: "Clock daemon", value: 15 },
  { label: "Local use 0", value: 16 },
  { label: "Local use 1", value: 17 },
  { label: "Local use 2", value: 18 },
  { label: "Local use 3", value: 19 },
  { label: "Local use 4", value: 20 },
  { label: "Local use 5", value: 21 },
  { label: "Local use 6", value: 22 },
  { label: "Local use 7", value: 23 },
];

export const filterFields = [
  {
    label: "Time Range",
    value: "timestamp",
    type: "timerange",
    defaultOpen: true,
    commandDisabled: true,
  },
  {
    label: "Severity",
    value: "severity",
    type: "checkbox",
    defaultOpen: true,
    options: SEVERITY_LABELS.map((label, index) => ({
      label: label,
      value: index,
    })),
    component: (props: Option) => {
      const value = props.value as number;
      return (
        <div className="flex w-full max-w-28 items-center justify-between gap-2 font-mono">
          <span className="capitalize text-foreground/70 group-hover:text-accent-foreground">
            {props.label}
          </span>
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "h-2.5 w-2.5 rounded-[2px]",
                getSeverityColor(SEVERITY_VALUES[value]).bg,
              )}
            />
          </div>
        </div>
      );
    },
  },
  {
    label: "Facility",
    value: "facility",
    type: "checkbox",
    options: SYSLOG_FACILITIES,
    component: (props: Option) => {
      return <span className="font-mono">{props.label}</span>;
    },
  },
  {
    label: "Hostname",
    value: "hostname",
    type: "input",
  },
  {
    label: "App Name",
    value: "appName",
    type: "input",
  },
  {
    label: "Proc ID",
    value: "procId",
    type: "input",
  },
  {
    label: "Msg ID",
    value: "msgId",
    type: "input",
  },
  {
    label: "Message",
    value: "message",
    type: "input",
    placeholder: "not found",
  },
  {
    label: "Format",
    value: "format",
    type: "input",
    placeholder: "cef",
  },
  {
    label: "CEF Version",
    value: "cefVersion",
    type: "input",
  },
  {
    label: "CEF Vendor",
    value: "cefDeviceVendor",
    type: "input",
  },
  {
    label: "CEF Product",
    value: "cefDeviceProduct",
    type: "input",
  },
  {
    label: "CEF Device Version",
    value: "cefDeviceVersion",
    type: "input",
  },
  {
    label: "CEF Signature ID",
    value: "cefSignatureId",
    type: "input",
  },
  {
    label: "CEF Name",
    value: "cefName",
    type: "input",
  },
  {
    label: "CEF Severity",
    value: "cefSeverity",
    type: "input",
  },
  {
    label: "CEF Extensions",
    value: "cefExt",
    type: "input",
    commandDisabled: true,
    placeholder: "src=10.0.0.1; proto=udp",
    parseInput: parseCEFExtensionFilters,
    serializeInput: serializeCEFExtensionFilters,
  },
  {
    label: "Message Fields",
    value: "msgField",
    type: "input",
    commandDisabled: true,
    placeholder: "type=dnsAdBlock; protocol=udp",
    parseInput: parseMessageFieldFilters,
    serializeInput: serializeMessageFieldFilters,
  },
] satisfies DataTableFilterField<ColumnSchema>[];

export const sheetFields = [
  {
    id: "id",
    label: "ID",
    type: "readonly",
    component: (props) => <span className="font-mono">{props.id}</span>,
    skeletonClassName: "w-16",
  },
  {
    id: "timestamp",
    label: "Timestamp",
    type: "timerange",
    component: (props) =>
      format(new Date(props.timestamp), "LLL dd, y HH:mm:ss"),
    skeletonClassName: "w-36",
  },
  {
    id: "priority",
    label: "Priority",
    type: "readonly",
    component: (props) => {
      const facility = props.facility;
      const severity = props.severity;
      const facilityNames = [
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
      return (
        <div className="flex flex-col">
          <span className="font-mono">
            {props.facility * 8 + props.severity}
          </span>
          <span className="text-sm text-muted-foreground">
            {facilityNames[facility]} ({facility}) • {SEVERITY_LABELS[severity]}{" "}
            ({severity})
          </span>
        </div>
      );
    },
    skeletonClassName: "w-16",
  },
  {
    id: "hostname",
    label: "Hostname",
    type: "input",
    skeletonClassName: "w-24",
  },
  {
    id: "format",
    label: "Format",
    type: "input",
    skeletonClassName: "w-16",
  },
  {
    id: "appName",
    label: "App Name",
    type: "input",
    skeletonClassName: "w-20",
  },
  {
    id: "procId",
    label: "Proc ID",
    type: "input",
    skeletonClassName: "w-16",
  },
  {
    id: "msgId",
    label: "Msg ID",
    type: "input",
    skeletonClassName: "w-16",
  },
  {
    id: "structuredData",
    label: "Structured Data",
    type: "readonly",
    condition: (props) =>
      props.structuredData !== undefined &&
      Object.keys(props.structuredData).length > 0,
    component: (props) => {
      // Render a separate section for each sd-id
      return (
        <div className="mt-0.5 flex w-full flex-col gap-4">
          {Object.entries(props.structuredData || {}).map(([sdId, kvPairs]) => (
            <div key={sdId} className="flex w-full flex-col gap-1">
              <div className="text-left text-sm font-medium">{sdId}</div>
              <KVTabs data={kvPairs} className="-mt-[22px]" />
            </div>
          ))}
        </div>
      );
    },
    className: "flex-col items-start w-full gap-1",
  },
  {
    id: "cefVersion",
    label: "CEF Version",
    type: "input",
    condition: (props) => props.format === "cef" && !!props.cefVersion,
    skeletonClassName: "w-12",
  },
  {
    id: "cefDeviceVendor",
    label: "CEF Vendor",
    type: "input",
    condition: (props) => props.format === "cef" && !!props.cefDeviceVendor,
    skeletonClassName: "w-24",
  },
  {
    id: "cefDeviceProduct",
    label: "CEF Product",
    type: "input",
    condition: (props) => props.format === "cef" && !!props.cefDeviceProduct,
    skeletonClassName: "w-24",
  },
  {
    id: "cefDeviceVersion",
    label: "CEF Device Version",
    type: "input",
    condition: (props) => props.format === "cef" && !!props.cefDeviceVersion,
    skeletonClassName: "w-16",
  },
  {
    id: "cefSignatureId",
    label: "CEF Signature ID",
    type: "input",
    condition: (props) => props.format === "cef" && !!props.cefSignatureId,
    skeletonClassName: "w-20",
  },
  {
    id: "cefName",
    label: "CEF Name",
    type: "input",
    condition: (props) => props.format === "cef" && !!props.cefName,
    skeletonClassName: "w-28",
  },
  {
    id: "cefSeverity",
    label: "CEF Severity",
    type: "input",
    condition: (props) => props.format === "cef" && !!props.cefSeverity,
    skeletonClassName: "w-12",
  },
  {
    id: "cefExtensions",
    label: "CEF Extensions",
    type: "readonly",
    condition: (props) =>
      props.format === "cef" &&
      props.cefExtensions !== undefined &&
      Object.keys(props.cefExtensions).length > 0,
    component: (props) => (
      <KVTable
        data={props.cefExtensions || {}}
        fieldValue="cefExt"
        table={props.table}
        filterFields={props.filterFields}
      />
    ),
    className: "flex-col items-start w-full gap-1",
  },
  {
    id: "messageFields",
    label: "Message Fields",
    type: "readonly",
    condition: (props) =>
      props.messageFields !== undefined &&
      Object.keys(props.messageFields).length > 0,
    component: (props) => (
      <KVTable
        data={props.messageFields || {}}
        fieldValue="msgField"
        table={props.table}
        filterFields={props.filterFields}
      />
    ),
    className: "flex-col items-start w-full gap-1",
  },
  {
    id: "message",
    label: "Message",
    type: "input",
    component: (props) => (
      <CopyToClipboardContainer>{props.message}</CopyToClipboardContainer>
    ),
    className: "flex-col items-start w-full gap-1",
  },
] satisfies SheetField<ColumnSchema, LogsMeta>[];

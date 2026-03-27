import {
  ARRAY_DELIMITER,
  RANGE_DELIMITER,
  SORT_DELIMITER,
} from "@/lib/delimiters";
import {
  createParser,
  createSearchParamsCache,
  createSerializer,
  parseAsArrayOf,
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  parseAsTimestamp,
  type inferParserType,
} from "nuqs/server";
import {
  parseCEFExtensionFiltersFromQuery,
  serializeCEFExtensionFiltersForQuery,
} from "./cef";
import {
  parseMessageFieldFiltersFromQuery,
  serializeMessageFieldFiltersForQuery,
} from "./message-fields";

// https://logs.run/i?sort=priority.desc

export const parseAsSort = createParser({
  parse(queryValue) {
    const [id, desc] = queryValue.split(SORT_DELIMITER);
    if (!id && !desc) return null;
    return { id, desc: desc === "desc" };
  },
  serialize(value) {
    return `${value.id}.${value.desc ? "desc" : "asc"}`;
  },
});

export const parseAsCEFExt = createParser({
  parse(queryValue) {
    return parseCEFExtensionFiltersFromQuery(queryValue);
  },
  serialize(value) {
    return serializeCEFExtensionFiltersForQuery(value);
  },
});

export const parseAsMsgField = createParser({
  parse(queryValue) {
    return parseMessageFieldFiltersFromQuery(queryValue);
  },
  serialize(value) {
    return serializeMessageFieldFiltersForQuery(value);
  },
});

export const parseAsStringFilter = createParser({
  parse(queryValue) {
    const trimmedValue = queryValue.trim();
    if (!trimmedValue) return null;

    if (trimmedValue.startsWith("[")) {
      try {
        const parsedValue = JSON.parse(trimmedValue);
        if (!Array.isArray(parsedValue)) return trimmedValue;

        const normalizedValues = parsedValue
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
          .filter((value) => value.length > 0);

        if (normalizedValues.length === 0) return null;
        if (normalizedValues.length === 1) return normalizedValues[0];
        return normalizedValues;
      } catch {
        return trimmedValue;
      }
    }

    return trimmedValue;
  },
  serialize(value) {
    if (Array.isArray(value)) {
      const normalizedValues = value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);

      if (normalizedValues.length === 0) return "";
      if (normalizedValues.length === 1) return normalizedValues[0];
      return JSON.stringify(normalizedValues);
    }

    return value.trim();
  },
});

export const searchParamsParser = {
  // CUSTOM FILTERS
  facility: parseAsArrayOf(parseAsInteger, ARRAY_DELIMITER),
  severity: parseAsArrayOf(parseAsInteger, ARRAY_DELIMITER),
  hostname: parseAsStringFilter,
  appName: parseAsStringFilter,
  procId: parseAsStringFilter,
  msgId: parseAsStringFilter,
  message: parseAsStringFilter,
  format: parseAsStringFilter,
  cefVersion: parseAsStringFilter,
  cefDeviceVendor: parseAsStringFilter,
  cefDeviceProduct: parseAsStringFilter,
  cefDeviceVersion: parseAsStringFilter,
  cefSignatureId: parseAsStringFilter,
  cefName: parseAsStringFilter,
  cefSeverity: parseAsStringFilter,
  cefExt: parseAsCEFExt,
  msgField: parseAsMsgField,
  timestamp: parseAsArrayOf(parseAsTimestamp, RANGE_DELIMITER),
  // REQUIRED FOR SORTING & PAGINATION
  cursor: parseAsTimestamp.withDefault(new Date()),
  sort: parseAsSort,
  size: parseAsInteger.withDefault(40),
  start: parseAsInteger.withDefault(0),
  // REQUIRED FOR INFINITE SCROLLING (Live Mode and Load More)
  direction: parseAsStringLiteral(["prev", "next"]).withDefault("next"),
  live: parseAsBoolean.withDefault(false),
  id: parseAsInteger,
};

export const searchParamsCache = createSearchParamsCache(searchParamsParser);

export const searchParamsSerializer = createSerializer(searchParamsParser);

export type SearchParamsType = inferParserType<typeof searchParamsParser>;

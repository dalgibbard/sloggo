import {
  ARRAY_DELIMITER,
  RANGE_DELIMITER,
  SLIDER_DELIMITER,
} from "@/lib/delimiters";
import { isArrayOfDates } from "@/lib/is-array";
import { ColumnFiltersState } from "@tanstack/react-table";
import { ParserBuilder } from "nuqs";
import type { DataTableFilterField } from "../types";

const NEGATION_PREFIX = "!";
const COMMAND_SEPARATORS = [":", "="] as const;

/**
 * Extracts the word from the given string at the specified caret position.
 */
export function getWordByCaretPosition({
  value,
  caretPosition,
}: {
  value: string;
  caretPosition: number;
}) {
  let start = caretPosition;
  let end = caretPosition;
  let inQuotes = false;

  for (let index = caretPosition - 1; index >= 0; index -= 1) {
    const char = value[index];
    if (char === `"` && value[index - 1] !== `\\`) {
      inQuotes = !inQuotes;
    }
    if (char === " " && !inQuotes) {
      break;
    }
    start = index;
  }

  inQuotes = false;
  for (let index = caretPosition; index < value.length; index += 1) {
    const char = value[index];
    if (char === `"` && value[index - 1] !== `\\`) {
      inQuotes = !inQuotes;
    }
    if (char === " " && !inQuotes) {
      break;
    }
    end = index + 1;
  }

  const word = value.substring(start, end);
  return word;
}

export function replaceInputByFieldType<TData>({
  prev,
  currentWord,
  optionValue,
  value,
  field,
}: {
  prev: string;
  currentWord: string;
  optionValue?: string | number | boolean | undefined; // FIXME: use DataTableFilterField<TData>["options"][number];
  value: string;
  field: DataTableFilterField<TData>;
}) {
  const exclude = isNegatedCommandToken(currentWord);
  const normalizedValue = applyCommandNegation(value, exclude);

  switch (field.type) {
    case "checkbox": {
      if (currentWord.includes(ARRAY_DELIMITER)) {
        const words = currentWord.split(ARRAY_DELIMITER);
        words[words.length - 1] = `${optionValue}`;
        const input = prev.replace(currentWord, words.join(ARRAY_DELIMITER));
        return `${input.trim()} `;
      }
    }
    case "slider": {
      if (currentWord.includes(SLIDER_DELIMITER)) {
        const words = currentWord.split(SLIDER_DELIMITER);
        words[words.length - 1] = `${optionValue}`;
        const input = prev.replace(currentWord, words.join(SLIDER_DELIMITER));
        return `${input.trim()} `;
      }
    }
    case "timerange": {
      if (currentWord.includes(RANGE_DELIMITER)) {
        const words = currentWord.split(RANGE_DELIMITER);
        words[words.length - 1] = `${optionValue}`;
        const input = prev.replace(currentWord, words.join(RANGE_DELIMITER));
        return `${input.trim()} `;
      }
    }
    default: {
      const input = prev.replace(currentWord, normalizedValue);
      return `${input.trim()} `;
    }
  }
}

export function getFieldOptions<TData>({
  field,
}: {
  field: DataTableFilterField<TData>;
}) {
  switch (field.type) {
    case "slider": {
      return field.options?.length
        ? field.options
            .map(({ value }) => value)
            .sort((a, b) => Number(a) - Number(b))
            .filter(notEmpty)
        : Array.from(
            { length: field.max - field.min + 1 },
            (_, i) => field.min + i,
          ) || [];
    }
    default: {
      return field.options?.map(({ value }) => value).filter(notEmpty) || [];
    }
  }
}

export function getFilterValue({
  value,
  search,
  currentWord,
}: {
  value: string;
  search: string;
  keywords?: string[] | undefined;
  currentWord: string;
}): number {
  const normalizedSearch = stripNegationPrefix(search.toLowerCase());
  const normalizedCurrentWord = stripNegationPrefix(currentWord.toLowerCase());
  const isNegationKeyword = currentWord.toUpperCase() === "NOT";

  /**
   * @example value "suggestion:public:true regions,ams,gru,fra"
   */
  if (value.startsWith("suggestion:")) {
    const rawValue = value.toLowerCase().replace("suggestion:", "");
    if (isNegationKeyword || rawValue.includes(normalizedSearch)) return 1;
    return 0;
  }

  /** */
  if (isNegationKeyword || value.toLowerCase().includes(normalizedCurrentWord))
    return 1;

  /**
   * @example checkbox [filter, query] = ["regions", "ams,gru,fra"]
   * @example slider [filter, query] = ["p95", "0-3000"]
   * @example input [filter, query] = ["name", "api"]
   */
  const [filter, rawQuery] = splitCommandToken(normalizedCurrentWord);
  const query = rawQuery?.startsWith(NEGATION_PREFIX)
    ? rawQuery.slice(1)
    : rawQuery;
  if (query && value.startsWith(`${filter}:`)) {
    if (query.includes(ARRAY_DELIMITER)) {
      /**
       * array of n elements
       * @example queries = ["ams", "gru", "fra"]
       */
      const queries = query.split(ARRAY_DELIMITER);
      const rawValue = value.toLowerCase().replace(`${filter}:`, "");
      if (
        queries.some((item, i) => item === rawValue && i !== queries.length - 1)
      )
        return 0;
      if (queries.some((item) => rawValue.includes(item))) return 1;
    }
    if (query.includes(SLIDER_DELIMITER)) {
      /**
       * range between 2 elements
       * @example queries = ["0", "3000"]
       */
      const queries = query.split(SLIDER_DELIMITER);
      const rawValue = value.toLowerCase().replace(`${filter}:`, "");

      const rawValueAsNumber = Number.parseInt(rawValue);
      const queryAsNumber = Number.parseInt(queries[0]);

      if (queryAsNumber < rawValueAsNumber) {
        if (rawValue.includes(queries[1])) return 1;
        return 0;
      }
      return 0;
    }
    const rawValue = value.toLowerCase().replace(`${filter}:`, "");
    if (rawValue.includes(query)) return 1;
  }
  return 0;
}

export function getFieldValueByType<TData>({
  field,
  value,
}: {
  field?: DataTableFilterField<TData>;
  value: unknown;
}) {
  if (!field) return null;

  switch (field.type) {
    case "slider": {
      if (Array.isArray(value)) {
        return value.join(SLIDER_DELIMITER);
      }
      return value;
    }
    case "checkbox": {
      if (Array.isArray(value)) {
        return value.join(ARRAY_DELIMITER);
      }
      // REMINER: inversed logic
      if (typeof value === "string") {
        return value.split(ARRAY_DELIMITER);
      }
      return value;
    }
    case "timerange": {
      if (Array.isArray(value)) {
        if (isArrayOfDates(value)) {
          return value.map((date) => date.getTime()).join(RANGE_DELIMITER);
        }
        return value.join(RANGE_DELIMITER);
      }
      if (value instanceof Date) {
        return value.getTime();
      }
      return value;
    }
    default: {
      return value;
    }
  }
}

export function notEmpty<TValue>(
  value: TValue | null | undefined,
): value is TValue {
  return value !== null && value !== undefined;
}

export function columnFiltersParser<TData>({
  searchParamsParser,
  filterFields,
}: {
  searchParamsParser: Record<string, ParserBuilder<any>>;
  filterFields: DataTableFilterField<TData>[];
}) {
  return {
    parse: (inputValue: string) => {
      const values = parseCommandTokens({ inputValue, filterFields });

      const searchParams = Object.entries(values).reduce(
        (prev, [key, value]) => {
          const parser = searchParamsParser[key];
          if (!parser) return prev;

          prev[key] =
            typeof value === "string" ? parser.parse(value) : value;
          return prev;
        },
        {} as Record<string, unknown>,
      );

      return searchParams;
    },
    serialize: (columnFilters: ColumnFiltersState) => {
      const values = columnFilters.reduce((prev, curr) => {
        const serializedDynamicValue = serializeDynamicCommandFilter(curr);
        if (serializedDynamicValue) {
          return `${prev}${serializedDynamicValue}`;
        }

        const field = filterFields?.find((field) => curr.id === field.value);
        const { commandDisabled } = field || { commandDisabled: true }; // if column filter is not found, disable the command by default
        const parser = searchParamsParser[curr.id];

        if (commandDisabled || !parser) return prev;

        if (field?.type === "input" && typeof curr.value === "string") {
          return `${prev}${serializeInputCommandTokens(curr.id, [curr.value])}`;
        }

        if (
          field?.type === "input" &&
          Array.isArray(curr.value) &&
          curr.value.every((entry) => typeof entry === "string")
        ) {
          return `${prev}${serializeInputCommandTokens(curr.id, curr.value)}`;
        }

        return `${prev}${curr.id}:${parser.serialize(curr.value)} `;
      }, "");

      return values;
    },
  };
}

export function isCommandInputReady<TData>({
  inputValue,
  filterFields,
}: {
  inputValue: string;
  filterFields: DataTableFilterField<TData>[];
}) {
  const tokens = tokenizeCommandInput(inputValue.trim());
  if (tokens.length === 0) return false;

  let negateNext = false;
  for (const token of tokens) {
    if (token.toUpperCase() === "NOT") {
      negateNext = true;
      continue;
    }

    const parsedToken = parseCommandToken({ token, negateNext, filterFields });
    if (!parsedToken) return false;
    negateNext = false;
  }

  return !negateNext;
}

function parseCommandTokens<TData>({
  inputValue,
  filterFields,
}: {
  inputValue: string;
  filterFields: DataTableFilterField<TData>[];
}) {
  const values = {} as Record<string, unknown>;
  let negateNext = false;

  for (const token of tokenizeCommandInput(inputValue)) {
    if (token.toUpperCase() === "NOT") {
      negateNext = true;
      continue;
    }

    const parsedToken = parseCommandToken({ token, negateNext, filterFields });
    negateNext = false;

    if (!parsedToken) continue;

    if (isStringRecord(parsedToken.value)) {
      const existingValue = values[parsedToken.name];
      values[parsedToken.name] = {
        ...(isStringRecord(existingValue) ? existingValue : {}),
        ...parsedToken.value,
      };
      continue;
    }

    values[parsedToken.name] = mergeCommandFilterValue(
      values[parsedToken.name],
      parsedToken.value,
    );
  }

  return values;
}

function parseCommandToken<TData>({
  token,
  negateNext,
  filterFields,
}: {
  token: string;
  negateNext: boolean;
  filterFields: DataTableFilterField<TData>[];
}) {
  const separatorIndex = getCommandSeparatorIndex(token);
  if (separatorIndex <= 0) {
    return parseDefaultCommandToken({ token, negateNext });
  }

  let name = token.slice(0, separatorIndex);
  let value = token.slice(separatorIndex + 1);
  let exclude = negateNext;

  if (name.startsWith(NEGATION_PREFIX)) {
    exclude = true;
    name = name.slice(1);
  }

  name = normalizeCommandFieldName(name);

  if (value.startsWith(NEGATION_PREFIX)) {
    exclude = true;
    value = value.slice(1);
  }

  value = unquoteCommandValue(value);

  if (!name || !value) return null;

  const dynamicFieldToken = parseDynamicCommandFieldToken({
    name,
    value,
    exclude,
  });
  if (dynamicFieldToken) {
    return dynamicFieldToken;
  }

  const field = filterFields.find((field) => String(field.value) === name);
  if (exclude && field?.type !== "input") return null;

  return {
    name,
    value: exclude ? `${NEGATION_PREFIX}${value}` : value,
  };
}

function parseDefaultCommandToken({
  token,
  negateNext,
}: {
  token: string;
  negateNext: boolean;
}) {
  let value = token.trim();
  let exclude = negateNext;

  if (value.startsWith(NEGATION_PREFIX)) {
    exclude = true;
    value = value.slice(1);
  }

  if (!isQuotedCommandValue(value)) {
    return null;
  }

  value = unquoteCommandValue(value);

  if (!value) return null;

  return {
    name: "message",
    value: exclude ? `${NEGATION_PREFIX}${value}` : value,
  };
}

function stripNegationPrefix(value: string) {
  return value.startsWith(NEGATION_PREFIX) ? value.slice(1) : value;
}

function isNegatedCommandToken(value: string) {
  if (value.startsWith(NEGATION_PREFIX)) return true;

  const [, queryValue = ""] = splitCommandToken(value);
  return queryValue.startsWith(NEGATION_PREFIX);
}

function applyCommandNegation(value: string, exclude: boolean) {
  if (!exclude) return value;
  return value.startsWith(NEGATION_PREFIX)
    ? value
    : `${NEGATION_PREFIX}${value}`;
}

function isNegatedFilterValue(value: string) {
  return value.startsWith(NEGATION_PREFIX);
}

function tokenizeCommandInput(inputValue: string) {
  const tokens: string[] = [];
  let currentToken = "";
  let inQuotes = false;

  for (let index = 0; index < inputValue.length; index += 1) {
    const char = inputValue[index];

    if (char === `"` && inputValue[index - 1] !== `\\`) {
      inQuotes = !inQuotes;
      currentToken += char;
      continue;
    }

    if (char === " " && !inQuotes) {
      if (currentToken.trim()) {
        tokens.push(currentToken);
      }
      currentToken = "";
      continue;
    }

    currentToken += char;
  }

  if (currentToken.trim()) {
    tokens.push(currentToken);
  }

  return tokens.filter(notEmpty);
}

function quoteCommandValue(value: string) {
  if (!/[\s"]/.test(value)) {
    return value;
  }

  const escaped = value.replaceAll(`\\`, `\\\\`).replaceAll(`"`, `\\"`);
  return `"${escaped}"`;
}

function isQuotedCommandValue(value: string) {
  return value.length >= 2 && value.startsWith(`"`) && value.endsWith(`"`);
}

function unquoteCommandValue(value: string) {
  if (value.length < 2 || !value.startsWith(`"`) || !value.endsWith(`"`)) {
    return value;
  }

  return value
    .slice(1, -1)
    .replaceAll(`\\"`, `"`)
    .replaceAll(`\\\\`, `\\`);
}

function normalizeCommandFieldName(value: string) {
  if (value === "messages") {
    return "message";
  }

  if (value.startsWith("messages.")) {
    return `message.${value.slice("messages.".length)}`;
  }

  return value;
}

function getCommandSeparatorIndex(value: string) {
  const indexes = COMMAND_SEPARATORS
    .map((separator) => value.indexOf(separator))
    .filter((index) => index > 0);

  if (!indexes.length) return -1;

  return Math.min(...indexes);
}

function splitCommandToken(value: string) {
  const separatorIndex = getCommandSeparatorIndex(value);
  if (separatorIndex <= 0) {
    return [value, ""] as const;
  }

  return [
    value.slice(0, separatorIndex),
    value.slice(separatorIndex + 1),
  ] as const;
}

function parseDynamicCommandFieldToken({
  name,
  value,
  exclude,
}: {
  name: string;
  value: string;
  exclude: boolean;
}) {
  if (name.startsWith("message.")) {
    const key = name.slice("message.".length).trim();
    if (!key) return null;

    return {
      name: "msgField",
      value: { [key]: exclude ? `${NEGATION_PREFIX}${value}` : value },
    };
  }

  if (name.startsWith("cef.")) {
    const key = name.slice("cef.".length).trim();
    if (!key) return null;

    return {
      name: "cefExt",
      value: { [key]: exclude ? `${NEGATION_PREFIX}${value}` : value },
    };
  }

  return null;
}

function serializeDynamicCommandFilter(filter: ColumnFiltersState[number]) {
  const prefix =
    filter.id === "msgField" ? "message" : filter.id === "cefExt" ? "cef" : "";
  if (!prefix || !isStringRecord(filter.value)) {
    return "";
  }

  return Object.entries(filter.value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => {
      const exclude = isNegatedFilterValue(value);
      const rawValue = exclude ? value.slice(1) : value;
      const serializedValue = quoteCommandValue(rawValue);
      const tokenPrefix = exclude ? NEGATION_PREFIX : "";
      return `${tokenPrefix}${prefix}.${key}:${serializedValue}`;
    })
    .join(" ")
    .concat(Object.keys(filter.value).length ? " " : "");
}

function serializeInputCommandTokens(fieldID: string, values: string[]) {
  return values
    .map((value) => {
      const exclude = isNegatedFilterValue(value);
      const rawValue = exclude ? value.slice(1) : value;
      const serializedValue = quoteCommandValue(rawValue);
      const prefix = exclude ? NEGATION_PREFIX : "";
      return `${prefix}${fieldID}:${serializedValue}`;
    })
    .join(" ")
    .concat(values.length ? " " : "");
}

function mergeCommandFilterValue(
  currentValue: unknown,
  nextValue: unknown,
): unknown {
  if (typeof nextValue !== "string") {
    return nextValue;
  }

  if (typeof currentValue === "undefined") {
    return nextValue;
  }

  const currentValues = Array.isArray(currentValue)
    ? currentValue.filter((value): value is string => typeof value === "string")
    : typeof currentValue === "string"
      ? [currentValue]
      : [];

  if (currentValues.length === 0) {
    return nextValue;
  }

  if (currentValues.includes(nextValue)) {
    return currentValues.length === 1 ? currentValues[0] : currentValues;
  }

  const combinedValues = [...currentValues, nextValue];
  return combinedValues.length === 1 ? combinedValues[0] : combinedValues;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((entry) => typeof entry === "string");
}

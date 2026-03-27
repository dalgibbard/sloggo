export type MessageFieldFilters = Record<string, string>;

export function parseMessageFieldFilters(
  input: string | null | undefined,
): MessageFieldFilters | null {
  if (!input) return null;

  const filters = input
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const separator = part.indexOf("=");
      if (separator <= 0) return acc;

      const key = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      if (!key || !value) return acc;

      acc[key] = value;
      return acc;
    }, {} as MessageFieldFilters);

  return Object.keys(filters).length ? filters : null;
}

export function serializeMessageFieldFilters(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";

  return Object.entries(value as MessageFieldFilters)
    .filter((entry): entry is [string, string] => {
      const [key, entryValue] = entry;
      return typeof key === "string" && typeof entryValue === "string";
    })
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entryValue]) => `${key}=${entryValue}`)
    .join("; ");
}

export function serializeMessageFieldFiltersForQuery(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "{}";
  }

  return JSON.stringify(
    Object.fromEntries(
      Object.entries(value as MessageFieldFilters)
        .filter((entry): entry is [string, string] => {
          const [key, entryValue] = entry;
          return typeof key === "string" && typeof entryValue === "string";
        })
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
  );
}

export function parseMessageFieldFiltersFromQuery(
  value: string,
): MessageFieldFilters | null {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    const filters = Object.entries(parsed).reduce((acc, [key, entryValue]) => {
      if (typeof entryValue !== "string") return acc;
      acc[key] = entryValue;
      return acc;
    }, {} as MessageFieldFilters);

    return Object.keys(filters).length ? filters : null;
  } catch {
    return null;
  }
}
